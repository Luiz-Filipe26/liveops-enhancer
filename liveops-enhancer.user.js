// ==UserScript==
// @name         Seidor LiveOps - Melhorias na tabela
// @namespace    custom.liveops
// @version      1.0
// @description  Melhora layout, rolagem, foco, ordenação, reorganização de colunas e exportação da tabela de chamados
// @match        https://liveops-americas.seidor.com/*
// @updateURL    https://raw.githubusercontent.com/Luiz-Filipe26/liveops-enhancer/main/liveops-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/Luiz-Filipe26/liveops-enhancer/main/liveops-enhancer.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /*
     * ============================================================
     * Constantes gerais
     * ============================================================
     */

    const TABLE_SELECTOR = '#grid';

    const STORAGE_KEY = 'liveops-enhancer-preferences';

    const ENHANCED_FLAG = 'liveopsEnhanced';
    const HEADER_ENHANCED_FLAG = 'liveopsHeaderEnhanced';

    const VIEWPORT_CLASS = 'liveops-enhancer-viewport';
    const DRAGGING_CLASS = 'liveops-enhancer-dragging';
    const EXPORT_ITEM_DRAGGING_CLASS =
    'liveops-enhancer-export-item-dragging';

    const FOCUS_BUTTON_ID = 'liveops-enhancer-focus-table';
    const COPY_BUTTON_ID = 'liveops-enhancer-copy-table';
    const CONFIGURE_COPY_BUTTON_ID =
        'liveops-enhancer-configure-copy';

    const STYLE_ID = 'liveops-enhancer-styles';

    const EXPORT_OVERLAY_ID =
        'liveops-enhancer-export-overlay';

    const EXPORT_PANEL_CLASS =
        'liveops-enhancer-export-panel';

    /*
     * ============================================================
     * Preferências
     * ============================================================
     */

    const DEFAULT_EXPORT_COLUMNS = [
        'ticketExternalId',
        'internalTicket',
        'customerCode',
        'ticketProblemTypeName',
        'ticketSlaPercentage',
        'ticketTitle',
        'areaName',
        'ticketStatusName',
        'startDate',
        'updateDate',
        'endDateEstimate',
        'ticketAssignee'
    ];

    function loadPreferences() {
        try {
            const raw =
                localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return {};
            }

            const preferences = JSON.parse(raw);

            if (
                preferences.columnOrder != null &&
                !Array.isArray(
                    preferences.columnOrder
                )
            ) {
                delete preferences.columnOrder;
            }

            if (
                preferences.exportColumns != null &&
                !Array.isArray(
                    preferences.exportColumns
                )
            ) {
                delete preferences.exportColumns;
            }

            if (
                preferences.sort &&
                (
                    typeof preferences.sort.column !==
                        'string' ||
                    !['asc', 'desc'].includes(
                        preferences.sort.direction
                    )
                )
            ) {
                delete preferences.sort;
            }

            return preferences;
        } catch {
            return {};
        }
    }

    function savePreferences(preferences) {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(preferences)
        );
    }

    /*
     * O conjunto default é gravado uma única vez.
     *
     * A partir daqui, o restante do script nunca usa
     * DEFAULT_EXPORT_COLUMNS diretamente para exportar.
     * O localStorage é a fonte única da verdade.
     */
    function initializePreferences() {
        const preferences =
            loadPreferences();

        let changed = false;

        if (
            !Array.isArray(
                preferences.exportColumns
            )
        ) {
            preferences.exportColumns = [
                ...DEFAULT_EXPORT_COLUMNS
            ];

            changed = true;
        }

        if (changed) {
            savePreferences(preferences);
        }
    }

    function saveColumnOrder(columnOrder) {
        const preferences =
            loadPreferences();

        const oldOrder =
            preferences.columnOrder;

        if (
            Array.isArray(oldOrder) &&
            oldOrder.length ===
                columnOrder.length &&
            oldOrder.every(
                (column, index) =>
                    column ===
                    columnOrder[index]
            )
        ) {
            return;
        }

        preferences.columnOrder = [
            ...columnOrder
        ];

        savePreferences(preferences);
    }

    function saveSort(
        column,
        direction
    ) {
        const preferences =
            loadPreferences();

        if (
            preferences.sort?.column ===
                column &&
            preferences.sort?.direction ===
                direction
        ) {
            return;
        }

        preferences.sort = {
            column,
            direction
        };

        savePreferences(preferences);
    }

    function saveExportColumns(
        exportColumns
    ) {
        const preferences =
            loadPreferences();

        const oldColumns =
            preferences.exportColumns;

        if (
            Array.isArray(oldColumns) &&
            oldColumns.length ===
                exportColumns.length &&
            oldColumns.every(
                (column, index) =>
                    column ===
                    exportColumns[index]
            )
        ) {
            return;
        }

        preferences.exportColumns = [
            ...exportColumns
        ];

        savePreferences(preferences);
    }

    /*
     * A inicialização das preferências acontece
     * antes do enhancement da página.
     */
    initializePreferences();

    /*
     * ============================================================
     * Utilidades de coluna
     * ============================================================
     */

    function getColumnId(cell) {
        if (!cell) {
            return null;
        }

        const columnClass =
            [...cell.classList].find(
                className =>
                    className.startsWith(
                        'mat-column-'
                    )
            );

        if (!columnClass) {
            return null;
        }

        return columnClass.slice(
            'mat-column-'.length
        );
    }

    function getColumnLabel(cell) {
        return (
            cell?.innerText
                ?.trim()
                .replace(/\s+/g, ' ') ||
            getColumnId(cell) ||
            ''
        );
    }

    function getColumnOrder(headerRow) {
        return [...headerRow.cells]
            .map(getColumnId)
            .filter(Boolean);
    }

    function getAvailableColumns(table) {
        const headerRow =
            table.tHead?.rows?.[0];

        if (!headerRow) {
            return [];
        }

        return [...headerRow.cells]
            .map(cell => {
                const id =
                    getColumnId(cell);

                if (!id) {
                    return null;
                }

                return {
                    id,
                    label:
                        getColumnLabel(cell)
                };
            })
            .filter(Boolean);
    }

    function moveColumnAfterInOrder(
        order,
        column,
        targetColumn
    ) {
        const sourceIndex =
            order.indexOf(column);

        const targetIndex =
            order.indexOf(targetColumn);

        if (
            sourceIndex < 0 ||
            targetIndex < 0 ||
            sourceIndex ===
                targetIndex + 1
        ) {
            return;
        }

        order.splice(sourceIndex, 1);

        const newTargetIndex =
            order.indexOf(targetColumn);

        order.splice(
            newTargetIndex + 1,
            0,
            column
        );
    }

    function buildDefaultColumnOrder(
        nativeOrder
    ) {
        const order =
            [...nativeOrder];

        moveColumnAfterInOrder(
            order,
            'endDateEstimate',
            'updateDate'
        );

        moveColumnAfterInOrder(
            order,
            'creatorName',
            'ticketAssignee'
        );

        return order;
    }

    /*
     * Combina uma ordem salva pelo usuário com
     * as colunas atualmente existentes no LiveOps.
     *
     * Colunas removidas desaparecem visualmente.
     *
     * Colunas novas entram próximas dos seus vizinhos
     * na ordem fornecida pelo próprio LiveOps.
     */
    function mergeColumnOrder(
        savedOrder,
        currentOrder
    ) {
        const currentSet =
            new Set(currentOrder);

        const result =
            savedOrder.filter(column =>
                currentSet.has(column)
            );

        const resultSet =
            new Set(result);

        for (
            let nativeIndex = 0;
            nativeIndex <
                currentOrder.length;
            nativeIndex++
        ) {
            const column =
                currentOrder[nativeIndex];

            if (
                resultSet.has(column)
            ) {
                continue;
            }

            let previous = null;
            let next = null;

            for (
                let index =
                    nativeIndex - 1;
                index >= 0;
                index--
            ) {
                const candidate =
                    currentOrder[index];

                if (
                    resultSet.has(candidate)
                ) {
                    previous =
                        candidate;

                    break;
                }
            }

            if (!previous) {
                for (
                    let index =
                        nativeIndex + 1;
                    index <
                        currentOrder.length;
                    index++
                ) {
                    const candidate =
                        currentOrder[index];

                    if (
                        resultSet.has(
                            candidate
                        )
                    ) {
                        next =
                            candidate;

                        break;
                    }
                }
            }

            if (previous) {
                result.splice(
                    result.indexOf(
                        previous
                    ) + 1,
                    0,
                    column
                );
            } else if (next) {
                result.splice(
                    result.indexOf(
                        next
                    ),
                    0,
                    column
                );
            } else {
                result.push(column);
            }

            resultSet.add(column);
        }

        return result;
    }

    function applyColumnOrder(
        table,
        order
    ) {
        const headerRow =
            table.tHead?.rows?.[0];

        if (!headerRow) {
            return;
        }

        /*
         * Evita tocar no DOM quando a ordem já
         * é exatamente a desejada.
         *
         * Isso é importante por causa do
         * MutationObserver.
         */
        const currentOrder =
            getColumnOrder(headerRow);

        if (
            currentOrder.length ===
                order.length &&
            currentOrder.every(
                (column, index) =>
                    column ===
                    order[index]
            )
        ) {
            return;
        }

        const rows = [
            ...(table.tHead?.rows ?? []),
            ...(table.tBodies?.[0]
                ?.rows ?? [])
        ];

        rows.forEach(row => {
            const cellsByColumn =
                new Map();

            [...row.cells].forEach(
                cell => {
                    const columnId =
                        getColumnId(cell);

                    if (columnId) {
                        cellsByColumn.set(
                            columnId,
                            cell
                        );
                    }
                }
            );

            order.forEach(
                columnId => {
                    const cell =
                        cellsByColumn.get(
                            columnId
                        );

                    if (cell) {
                        row.appendChild(
                            cell
                        );
                    }
                }
            );
        });
    }

    /*
     * ============================================================
     * Scroll e layout
     * ============================================================
     */

    function isScrollableY(element) {
        if (!element) {
            return false;
        }

        const style =
            getComputedStyle(element);

        const overflowY =
            style.overflowY;

        return (
            ['auto', 'scroll'].includes(
                overflowY
            ) &&
            element.scrollHeight >
                element.clientHeight
        );
    }

    function findOuterScroller(
        startElement
    ) {
        let element = startElement;

        while (element) {
            if (
                isScrollableY(element)
            ) {
                return element;
            }

            element =
                element.parentElement;
        }

        return (
            document.scrollingElement ||
            document.documentElement
        );
    }

    function installStyles() {
        if (
            document.getElementById(
                STYLE_ID
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id = STYLE_ID;

        style.textContent = `
            .${VIEWPORT_CLASS} {
                overflow: auto !important;
                overscroll-behavior-y: contain;
                width: 100%;
            }

            ${TABLE_SELECTOR} th {
                cursor: grab;
                user-select: none;
            }

            ${TABLE_SELECTOR} th[data-sort="asc"]::after {
                content: " ▲";
            }

            ${TABLE_SELECTOR} th[data-sort="desc"]::after {
                content: " ▼";
            }

            ${TABLE_SELECTOR} th.${DRAGGING_CLASS} {
                opacity: .5;
            }

            #${FOCUS_BUTTON_ID},
            #${COPY_BUTTON_ID},
            #${CONFIGURE_COPY_BUTTON_ID} {
                margin-left: 12px;
                border: 1px solid #bbb;
                border-radius: 4px;
                background: #fff;
                padding: 4px 10px;
                cursor: pointer;
                font-size: 13px;
                line-height: 1.4;
            }

            #${FOCUS_BUTTON_ID}:hover,
            #${COPY_BUTTON_ID}:hover,
            #${CONFIGURE_COPY_BUTTON_ID}:hover {
                background: #f3f3f3;
            }

            #${EXPORT_OVERLAY_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                background: rgba(0, 0, 0, .45);
                box-sizing: border-box;
            }

            .${EXPORT_PANEL_CLASS} {
                width: min(520px, 100%);
                max-height: calc(100vh - 48px);
                display: flex;
                flex-direction: column;
                background: #fff;
                border: 1px solid #aaa;
                border-radius: 6px;
                box-shadow:
                    0 8px 32px
                    rgba(0, 0, 0, .3);
                color: #222;
                box-sizing: border-box;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-header {
                padding: 16px 18px 10px;
                border-bottom: 1px solid #ddd;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-title {
                margin: 0 0 4px;
                font-size: 18px;
                font-weight: 600;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-description {
                margin: 0;
                color: #666;
                font-size: 13px;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-list {
                overflow: auto;
                padding: 10px 18px;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-option {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 7px 0;
                cursor: grab;
                font-size: 14px;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-option.${EXPORT_ITEM_DRAGGING_CLASS} {
                opacity: .5;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-drag-handle {
                color: #888;
                font-size: 16px;
                cursor: grab;
                user-select: none;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-option input {
                margin: 0;
                cursor: pointer;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-footer {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 8px;
                padding: 12px 18px;
                border-top: 1px solid #ddd;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-export-error {
                flex: 1;
                margin: 0;
                color: #b00020;
                font-size: 12px;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-dialog-button {
                border: 1px solid #bbb;
                border-radius: 4px;
                background: #fff;
                padding: 6px 14px;
                cursor: pointer;
                font-size: 13px;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-dialog-button:hover {
                background: #f3f3f3;
            }

            .${EXPORT_PANEL_CLASS} .liveops-enhancer-confirm-button {
                border-color: #777;
                font-weight: 600;
            }
        `;

        document.head.appendChild(style);
    }

    function createTableViewport(
        table
    ) {
        if (
            table.parentElement
                ?.classList
                .contains(
                    VIEWPORT_CLASS
                )
        ) {
            return table.parentElement;
        }

        const viewport =
            document.createElement(
                'div'
            );

        viewport.className =
            VIEWPORT_CLASS;

        table.parentNode.insertBefore(
            viewport,
            table
        );

        viewport.appendChild(table);

        return viewport;
    }

    function styleCells(table) {
        table.style.width =
            'max-content';

        table.style.minWidth =
            '100%';

        table
            .querySelectorAll(
                '.mat-header-cell, .mat-cell'
            )
            .forEach(cell => {
                cell.style.flex =
                    '0 0 auto';

                cell.style.minWidth =
                    '0';

                cell.style.maxWidth =
                    '16ch';

                cell.style.whiteSpace =
                    'normal';

                cell.style.overflowWrap =
                    'anywhere';

                cell.style.border =
                    '1px solid #ccc';

                cell.style.padding =
                    '0 8px';

                cell.style.boxSizing =
                    'border-box';
            });

        table
            .querySelectorAll(
                '.mat-column-internalTicket'
            )
            .forEach(cell => {
                cell.style.maxWidth =
                    '10ch';
            });
    }

    /*
     * ============================================================
     * Localização da área dos botões
     * ============================================================
     */

    function getCountContainer(table) {
        const gridComponent =
            table.closest(
                'app-ticket-list-v2-grid'
            );

        if (!gridComponent) {
            return null;
        }

        return gridComponent.querySelector(
            '.mb-20.ml-5'
        );
    }

    function prepareCountContainer(
        countContainer
    ) {
        if (!countContainer) {
            return;
        }

        countContainer.style.display =
            'flex';

        countContainer.style.alignItems =
            'center';

        countContainer.style.flexWrap =
            'wrap';
    }

    /*
     * ============================================================
     * Botão de foco
     * ============================================================
     */

    function installFocusButton(
        table,
        viewport,
        outerScroller,
        updateHeight
    ) {
        if (
            document.getElementById(
                FOCUS_BUTTON_ID
            )
        ) {
            return;
        }

        const countContainer =
            getCountContainer(table);

        if (!countContainer) {
            return;
        }

        prepareCountContainer(
            countContainer
        );

        const button =
            document.createElement(
                'button'
            );

        button.id =
            FOCUS_BUTTON_ID;

        button.type = 'button';

        button.textContent =
            '◎ Focar tabela';

        button.addEventListener(
            'click',
            () => {
                const outerRect =
                    outerScroller
                        .getBoundingClientRect();

                viewport.style.maxHeight =
                    Math.max(
                        200,
                        outerRect.height - 8
                    ) + 'px';

                /*
                 * Força o navegador a recalcular
                 * a geometria antes do scroll.
                 */
                void viewport.offsetHeight;

                const viewportRect =
                    viewport
                        .getBoundingClientRect();

                const targetScrollTop =
                    outerScroller.scrollTop +
                    viewportRect.top -
                    outerRect.top -
                    4;

                outerScroller.style
                    .overflowAnchor =
                    'none';

                outerScroller.scrollTop =
                    Math.max(
                        0,
                        targetScrollTop
                    );

                requestAnimationFrame(
                    () => {
                        updateHeight();

                        outerScroller
                            .style
                            .overflowAnchor =
                            '';
                    }
                );
            }
        );

        countContainer.appendChild(
            button
        );
    }

    /*
     * ============================================================
     * Configuração da exportação
     * ============================================================
     */

	function openExportConfiguration(table) {
		document
			.getElementById(
				EXPORT_OVERLAY_ID
			)
			?.remove();

		const availableColumns =
			getAvailableColumns(table);

		if (!availableColumns.length) {
			return;
		}

		const preferences =
			loadPreferences();

		const selectedColumns =
			new Set(
				preferences.exportColumns
			);

		const availableById =
			new Map(
				availableColumns.map(
					column => [
						column.id,
						column
					]
				)
			);

		/*
		 * A lista começa na ordem de exportação já salva.
		 *
		 * Depois entram as colunas disponíveis que ainda
		 * não fazem parte da configuração.
		 *
		 * Assim:
		 *
		 * - as colunas selecionadas preservam sua ordem;
		 * - colunas não selecionadas continuam disponíveis;
		 * - colunas novas aparecem no final, desmarcadas.
		 */
		const orderedColumns = [];

		for (
			const columnId of
			preferences.exportColumns
		) {
			const column =
				availableById.get(
					columnId
				);

			if (column) {
				orderedColumns.push(
					column
				);

				availableById.delete(
					columnId
				);
			}
		}

		/*
		 * O restante segue a ordem visual atual
		 * da tabela.
		 */
		for (
			const column of
			availableColumns
		) {
			if (
				availableById.has(
					column.id
				)
			) {
				orderedColumns.push(
					column
				);

				availableById.delete(
					column.id
				);
			}
		}

		const overlay =
			document.createElement(
				'div'
			);

		overlay.id =
			EXPORT_OVERLAY_ID;

		const panel =
			document.createElement(
				'div'
			);

		panel.className =
			EXPORT_PANEL_CLASS;

		panel.setAttribute(
			'role',
			'dialog'
		);

		panel.setAttribute(
			'aria-modal',
			'true'
		);

		panel.setAttribute(
			'aria-labelledby',
			'liveops-enhancer-export-title'
		);

		const header =
			document.createElement(
				'div'
			);

		header.className =
			'liveops-enhancer-export-header';

		const title =
			document.createElement(
				'h2'
			);

		title.id =
			'liveops-enhancer-export-title';

		title.className =
			'liveops-enhancer-export-title';

		title.textContent =
			'Colunas copiadas';

		const description =
			document.createElement(
				'p'
			);

		description.className =
			'liveops-enhancer-export-description';

		description.textContent =
			'Escolha e ordene as colunas que devem aparecer ao copiar a tabela em Markdown.';

		header.append(
			title,
			description
		);

		const list =
			document.createElement(
				'div'
			);

		list.className =
			'liveops-enhancer-export-list';

		/*
		 * ============================================================
		 * Itens da lista
		 * ============================================================
		 */

		orderedColumns.forEach(
			column => {
				const label =
					document.createElement(
						'label'
					);

				label.className =
					'liveops-enhancer-export-option';

				label.draggable =
					true;

				label.dataset.columnId =
					column.id;

				const handle =
					document.createElement(
						'span'
					);

				handle.className =
					'liveops-enhancer-export-drag-handle';

				handle.textContent =
					'☰';

				handle.title =
					'Arraste para alterar a ordem';

				const checkbox =
					document.createElement(
						'input'
					);

				checkbox.type =
					'checkbox';

				checkbox.value =
					column.id;

				checkbox.checked =
					selectedColumns.has(
						column.id
					);

				const text =
					document.createElement(
						'span'
					);

				text.textContent =
					column.label;

				label.append(
					handle,
					checkbox,
					text
				);

				list.appendChild(
					label
				);
			}
		);

		/*
		 * ============================================================
		 * Drag da configuração de exportação
		 * ============================================================
		 */

		let draggedItem = null;

		list.addEventListener(
			'dragstart',
			event => {
				const item =
					event.target.closest(
						'.liveops-enhancer-export-option'
					);

				if (
					!item ||
					!list.contains(item)
				) {
					return;
				}

				draggedItem =
					item;

				item.classList.add(
					EXPORT_ITEM_DRAGGING_CLASS
				);

				/*
				 * Alguns navegadores exigem algum
				 * conteúdo em dataTransfer para iniciar
				 * corretamente o drag.
				 */
				event.dataTransfer
					?.setData(
						'text/plain',
						item.dataset.columnId
					);

				if (
					event.dataTransfer
				) {
					event.dataTransfer.effectAllowed =
						'move';
				}
			}
		);

		list.addEventListener(
			'dragend',
			() => {
				draggedItem
					?.classList
					.remove(
						EXPORT_ITEM_DRAGGING_CLASS
					);

				draggedItem =
					null;
			}
		);

		list.addEventListener(
			'dragover',
			event => {
				if (!draggedItem) {
					return;
				}

				const target =
					event.target.closest(
						'.liveops-enhancer-export-option'
					);

				if (
					!target ||
					target ===
						draggedItem ||
					!list.contains(target)
				) {
					return;
				}

				event.preventDefault();

				const targetRect =
					target
						.getBoundingClientRect();

				const insertAfter =
					event.clientY >
					targetRect.top +
						targetRect.height / 2;

				if (insertAfter) {
					target.after(
						draggedItem
					);
				} else {
					target.before(
						draggedItem
					);
				}
			}
		);

		/*
		 * ============================================================
		 * Rodapé
		 * ============================================================
		 */

		const footer =
			document.createElement(
				'div'
			);

		footer.className =
			'liveops-enhancer-export-footer';

		const error =
			document.createElement(
				'p'
			);

		error.className =
			'liveops-enhancer-export-error';

		const cancelButton =
			document.createElement(
				'button'
			);

		cancelButton.type =
			'button';

		cancelButton.className =
			'liveops-enhancer-dialog-button';

		cancelButton.textContent =
			'Cancelar';

		const confirmButton =
			document.createElement(
				'button'
			);

		confirmButton.type =
			'button';

		confirmButton.className =
			'liveops-enhancer-dialog-button liveops-enhancer-confirm-button';

		confirmButton.textContent =
			'Confirmar';

		footer.append(
			error,
			cancelButton,
			confirmButton
		);

		panel.append(
			header,
			list,
			footer
		);

		overlay.appendChild(
			panel
		);

		const close = () => {
			document.removeEventListener(
				'keydown',
				handleKeyDown
			);

			overlay.remove();
		};

		const handleKeyDown =
			event => {
				if (
					event.key ===
					'Escape'
				) {
					close();
				}
			};

		cancelButton.addEventListener(
			'click',
			close
		);

		overlay.addEventListener(
			'click',
			event => {
				if (
					event.target ===
					overlay
				) {
					close();
				}
			}
		);

		/*
		 * ============================================================
		 * Confirmar
		 * ============================================================
		 */

		confirmButton.addEventListener(
			'click',
			() => {
				/*
				 * Agora a ordem vem diretamente
				 * da ordem atual dos elementos
				 * dentro do painel.
				 */
				const selectedCurrent =
					[
						...list.querySelectorAll(
							'.liveops-enhancer-export-option'
						)
					]
						.filter(
							item =>
								item.querySelector(
									'input[type="checkbox"]'
								)?.checked
						)
						.map(
							item =>
								item.dataset.columnId
						);

				if (
					selectedCurrent.length ===
					0
				) {
					error.textContent =
						'Selecione pelo menos uma coluna.';

					return;
				}

				/*
				 * Preserva eventuais colunas selecionadas
				 * que não estejam presentes nesta versão
				 * da tabela.
				 */
				const currentColumnIds =
					new Set(
						availableColumns.map(
							column =>
								column.id
						)
					);

				const unavailableSelected =
					preferences
						.exportColumns
						.filter(
							column =>
								!currentColumnIds.has(
									column
								)
						);

				saveExportColumns([
					...selectedCurrent,
					...unavailableSelected
				]);

				close();
			}
		);

		document.addEventListener(
			'keydown',
			handleKeyDown
		);

		document.body.appendChild(
			overlay
		);

		cancelButton.focus();
	}

    function installConfigureCopyButton(
        table
    ) {
        if (
            document.getElementById(
                CONFIGURE_COPY_BUTTON_ID
            )
        ) {
            return;
        }

        const countContainer =
            getCountContainer(table);

        if (!countContainer) {
            return;
        }

        prepareCountContainer(
            countContainer
        );

        const button =
            document.createElement(
                'button'
            );

        button.id =
            CONFIGURE_COPY_BUTTON_ID;

        button.type = 'button';

        button.textContent =
            '⚙ Configurar cópia';

        button.addEventListener(
            'click',
            () => {
                openExportConfiguration(
                    table
                );
            }
        );

        countContainer.appendChild(
            button
        );
    }

    /*
     * ============================================================
     * Exportação Markdown
     * ============================================================
     */

    function buildMarkdownTable(
        table
    ) {
        const preferences =
            loadPreferences();

        /*
         * Fonte única da verdade:
         * localStorage.
         */
        const exportColumns =
            preferences.exportColumns;

        if (
            !Array.isArray(
                exportColumns
            ) ||
            exportColumns.length === 0
        ) {
            return '';
        }

        const headerRow =
            table.tHead?.rows?.[0];

        const tbody =
            table.tBodies?.[0];

        if (
            !headerRow ||
            !tbody
        ) {
            return '';
        }

        const bodyRows =
            [...tbody.rows];

        const getCell = (
            row,
            columnId
        ) =>
            [...row.cells].find(
                cell =>
                    cell.classList.contains(
                        `mat-column-${columnId}`
                    )
            );

        /*
         * Preferências de colunas que não existem
         * atualmente são simplesmente ignoradas.
         */
        const availableExportColumns =
            exportColumns.filter(
                columnId =>
                    getCell(
                        headerRow,
                        columnId
                    )
            );

        if (
            availableExportColumns
                .length === 0
        ) {
            return '';
        }

        const getValue = (
            cell,
            columnId
        ) => {
            let value =
                cell?.innerText
                    ?.trim()
                    .replace(
                        /\s+/g,
                        ' '
                    ) ?? '';

            /*
             * O conteúdo visual da coluna Cliente
             * contém informação extra que não é útil
             * na exportação atual.
             */
            if (
                columnId ===
                'customerCode'
            ) {
                value = value
                    .split(/\s+/)
                    .slice(0, 5)
                    .join(' ');
            }

            /*
             * Pipes precisam ser escapados para não
             * quebrarem a tabela Markdown.
             */
            return value.replace(
                /\|/g,
                '\\|'
            );
        };

        const matrix = [
            availableExportColumns.map(
                columnId =>
                    getValue(
                        getCell(
                            headerRow,
                            columnId
                        ),
                        columnId
                    )
            ),

            ...bodyRows.map(
                row =>
                    availableExportColumns.map(
                        columnId =>
                            getValue(
                                getCell(
                                    row,
                                    columnId
                                ),
                                columnId
                            )
                    )
            )
        ];

        const widths =
            availableExportColumns.map(
                (_, columnIndex) =>
                    Math.max(
                        3,
                        ...matrix.map(
                            row =>
                                (
                                    row[
                                        columnIndex
                                    ] ?? ''
                                ).length
                        )
                    )
            );

        const formatRow =
            row =>
                '| ' +
                widths
                    .map(
                        (
                            width,
                            columnIndex
                        ) =>
                            (
                                row[
                                    columnIndex
                                ] ?? ''
                            ).padEnd(
                                width
                            )
                    )
                    .join(
                        ' | '
                    ) +
                ' |';

        const separator =
            '|-' +
            widths
                .map(
                    width =>
                        '-'.repeat(
                            width
                        )
                )
                .join('-|-') +
            '-|';

        return [
            formatRow(
                matrix[0]
            ),
            separator,
            ...matrix
                .slice(1)
                .map(formatRow)
        ].join('\n');
    }

    function installCopyButton(
        table
    ) {
        if (
            document.getElementById(
                COPY_BUTTON_ID
            )
        ) {
            return;
        }

        const countContainer =
            getCountContainer(table);

        if (!countContainer) {
            return;
        }

        prepareCountContainer(
            countContainer
        );

        const button =
            document.createElement(
                'button'
            );

        button.id =
            COPY_BUTTON_ID;

        button.type =
            'button';

        button.textContent =
            '⧉ Copiar tabela Markdown';

        button.addEventListener(
            'click',
            async () => {
                const text =
                    buildMarkdownTable(
                        table
                    );

                if (!text) {
                    return;
                }

                try {
                    await navigator
                        .clipboard
                        .writeText(text);
                } catch {
                    return;
                }

                const originalText =
                    button.textContent;

                button.textContent =
                    '✓ Copiado';

                setTimeout(
                    () => {
                        button.textContent =
                            originalText;
                    },
                    1200
                );
            }
        );

        countContainer.appendChild(
            button
        );
    }

    /*
     * ============================================================
     * Ordenação
     * ============================================================
     */

    function parseValue(raw) {
        const value =
            raw.trim();

        if (!value) {
            return null;
        }

        const dateMatch =
            value.match(
                /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
            );

        if (dateMatch) {
            return new Date(
                Number(
                    dateMatch[3]
                ),
                Number(
                    dateMatch[2]
                ) - 1,
                Number(
                    dateMatch[1]
                ),
                Number(
                    dateMatch[4] || 0
                ),
                Number(
                    dateMatch[5] || 0
                )
            ).getTime();
        }

        if (
            /^-?\d+(?:[.,]\d+)?$/
                .test(value)
        ) {
            return Number(
                value.replace(
                    ',',
                    '.'
                )
            );
        }

        return value;
    }

    function compareValues(
        a,
        b
    ) {
        if (
            typeof a === 'number' &&
            typeof b === 'number'
        ) {
            return a - b;
        }

        return String(a)
            .localeCompare(
                String(b),
                'pt-BR',
                {
                    numeric: true,
                    sensitivity:
                        'base'
                }
            );
    }

    function sortTable(
        table,
        columnId,
        direction
    ) {
        const headerRow =
            table.tHead?.rows?.[0];

        const tbody =
            table.tBodies?.[0];

        if (
            !headerRow ||
            !tbody
        ) {
            return false;
        }

        const headers =
            [...headerRow.cells];

        const columnIndex =
            headers.findIndex(
                header =>
                    getColumnId(
                        header
                    ) ===
                    columnId
            );

        if (
            columnIndex < 0
        ) {
            return false;
        }

        headers.forEach(
            header => {
                delete header
                    .dataset
                    .sort;
            }
        );

        headers[
            columnIndex
        ].dataset.sort =
            direction;

        const currentRows =
            [...tbody.rows];

        const sortedRows =
            [...currentRows].sort(
                (rowA, rowB) => {
                    const a =
                        parseValue(
                            rowA.cells[
                                columnIndex
                            ]?.innerText ||
                                ''
                        );

                    const b =
                        parseValue(
                            rowB.cells[
                                columnIndex
                            ]?.innerText ||
                                ''
                        );

                    /*
                     * Valores vazios permanecem
                     * sempre no final.
                     */
                    if (
                        a == null &&
                        b == null
                    ) {
                        return 0;
                    }

                    if (
                        a == null
                    ) {
                        return 1;
                    }

                    if (
                        b == null
                    ) {
                        return -1;
                    }

                    const comparison =
                        compareValues(
                            a,
                            b
                        );

                    return (
                        direction ===
                        'asc'
                            ? comparison
                            : -comparison
                    );
                }
            );

        /*
         * Se as linhas já estão na ordem desejada,
         * não tocamos no DOM.
         *
         * Isso evita mutações artificiais e callbacks
         * adicionais do MutationObserver.
         */
        const alreadySorted =
            currentRows.every(
                (row, index) =>
                    row ===
                    sortedRows[index]
            );

        if (
            !alreadySorted
        ) {
            sortedRows.forEach(
                row => {
                    tbody.appendChild(
                        row
                    );
                }
            );
        }

        return true;
    }

    function applySavedSort(
        table
    ) {
        const preferences =
            loadPreferences();

        const sort =
            preferences.sort;

        if (!sort) {
            return;
        }

        /*
         * Restaurar uma preferência nunca
         * grava novamente no localStorage.
         */
        sortTable(
            table,
            sort.column,
            sort.direction
        );
    }

    /*
     * ============================================================
     * Drag e clique nos cabeçalhos
     * ============================================================
     */

    function installSortingAndDragging(
        table,
        headerRow
    ) {
        [...headerRow.cells]
            .forEach(
                header => {
                    header.draggable =
                        true;
                }
            );

        if (
            headerRow.dataset[
                HEADER_ENHANCED_FLAG
            ] === '1'
        ) {
            return;
        }

        headerRow.dataset[
            HEADER_ENHANCED_FLAG
        ] = '1';

        let dragging = false;
        let sourceColumnId = null;
        let draggedHeader = null;

        const getHeaderFromEvent =
            event =>
                event.target.closest(
                    'th'
                );

        headerRow.addEventListener(
            'dragstart',
            event => {
                const header =
                    getHeaderFromEvent(
                        event
                    );

                if (
                    !header ||
                    !headerRow.contains(
                        header
                    )
                ) {
                    return;
                }

                sourceColumnId =
                    getColumnId(
                        header
                    );

                if (
                    !sourceColumnId
                ) {
                    return;
                }

                dragging = true;
                draggedHeader =
                    header;

                header.classList.add(
                    DRAGGING_CLASS
                );
            }
        );

        headerRow.addEventListener(
            'dragend',
            () => {
                draggedHeader
                    ?.classList
                    .remove(
                        DRAGGING_CLASS
                    );

                draggedHeader =
                    null;

                sourceColumnId =
                    null;

                setTimeout(
                    () => {
                        dragging =
                            false;
                    },
                    80
                );
            }
        );

        headerRow.addEventListener(
            'dragover',
            event => {
                const header =
                    getHeaderFromEvent(
                        event
                    );

                if (
                    !header ||
                    !headerRow.contains(
                        header
                    )
                ) {
                    return;
                }

                event.preventDefault();
            }
        );

        headerRow.addEventListener(
            'drop',
            event => {
                const targetHeader =
                    getHeaderFromEvent(
                        event
                    );

                if (
                    !targetHeader ||
                    !headerRow.contains(
                        targetHeader
                    )
                ) {
                    return;
                }

                event.preventDefault();

                const targetColumnId =
                    getColumnId(
                        targetHeader
                    );

                if (
                    !sourceColumnId ||
                    !targetColumnId ||
                    sourceColumnId ===
                        targetColumnId
                ) {
                    return;
                }

                const currentHeaderRow =
                    table.tHead
                        ?.rows?.[0];

                if (
                    !currentHeaderRow
                ) {
                    return;
                }

                const currentOrder =
                    getColumnOrder(
                        currentHeaderRow
                    );

                const sourceIndex =
                    currentOrder
                        .indexOf(
                            sourceColumnId
                        );

                const targetIndex =
                    currentOrder
                        .indexOf(
                            targetColumnId
                        );

                if (
                    sourceIndex < 0 ||
                    targetIndex < 0 ||
                    sourceIndex ===
                        targetIndex
                ) {
                    return;
                }

                const newOrder =
                    [...currentOrder];

                newOrder.splice(
                    sourceIndex,
                    1
                );

                /*
                 * Da esquerda para a direita:
                 * fica depois do alvo.
                 *
                 * Da direita para a esquerda:
                 * fica antes do alvo.
                 */
                const adjustedTarget =
                    newOrder.indexOf(
                        targetColumnId
                    );

                if (
                    sourceIndex <
                    targetIndex
                ) {
                    newOrder.splice(
                        adjustedTarget + 1,
                        0,
                        sourceColumnId
                    );
                } else {
                    newOrder.splice(
                        adjustedTarget,
                        0,
                        sourceColumnId
                    );
                }

                applyColumnOrder(
                    table,
                    newOrder
                );

                /*
                 * A ordem é persistida somente
                 * em resposta a uma alteração
                 * feita pelo usuário.
                 */
                saveColumnOrder(
                    newOrder
                );
            }
        );

        headerRow.addEventListener(
            'click',
            event => {
                if (dragging) {
                    return;
                }

                const header =
                    getHeaderFromEvent(
                        event
                    );

                if (
                    !header ||
                    !headerRow.contains(
                        header
                    )
                ) {
                    return;
                }

                const columnId =
                    getColumnId(
                        header
                    );

                if (
                    !columnId
                ) {
                    return;
                }

                const oldDirection =
                    header.dataset.sort;

                const direction =
                    oldDirection ===
                        'asc'
                        ? 'desc'
                        : 'asc';

                const sorted =
                    sortTable(
                        table,
                        columnId,
                        direction
                    );

                if (!sorted) {
                    return;
                }

                /*
                 * O sort só é salvo quando o usuário
                 * realmente altera a ordenação.
                 */
                saveSort(
                    columnId,
                    direction
                );
            }
        );
    }

    /*
     * ============================================================
     * Enhancement principal
     * ============================================================
     */

    function enhanceTable() {
        const table =
            document.querySelector(
                TABLE_SELECTOR
            );

        if (!table) {
            return;
        }

        const tbody =
            table.tBodies?.[0];

        const headerRow =
            table.tHead?.rows?.[0];

        if (
            !tbody ||
            !headerRow
        ) {
            return;
        }

        installStyles();

        /*
         * Capturamos a estrutura que existe antes
         * de aplicar nossas preferências.
         */
        const currentOrder =
            getColumnOrder(
                headerRow
            );

        const firstEnhancement =
            table.dataset[
                ENHANCED_FLAG
            ] !== '1';

        const viewport =
            createTableViewport(
                table
            );

        const outerScroller =
            findOuterScroller(
                viewport.parentElement
            );

        if (!outerScroller) {
            return;
        }

        const updateHeight =
            () => {
                const outerRect =
                    outerScroller
                        .getBoundingClientRect();

                const viewportRect =
                    viewport
                        .getBoundingClientRect();

                const visibleTop =
                    Math.max(
                        viewportRect.top,
                        outerRect.top
                    );

                const availableHeight =
                    outerRect.bottom -
                    visibleTop -
                    8;

                viewport.style.maxHeight =
                    Math.max(
                        200,
                        availableHeight
                    ) + 'px';
            };

        styleCells(table);

        const preferences =
            loadPreferences();

        let desiredOrder;

        if (
            Array.isArray(
                preferences.columnOrder
            )
        ) {
            desiredOrder =
                mergeColumnOrder(
                    preferences.columnOrder,
                    currentOrder
                );
        } else {
            /*
             * O layout inicial do script continua
             * sendo apenas um default visual.
             *
             * Ele só vira preferência persistente
             * quando o usuário realmente arrasta
             * alguma coluna.
             */
            desiredOrder =
                buildDefaultColumnOrder(
                    currentOrder
                );
        }

        applyColumnOrder(
            table,
            desiredOrder
        );

        table.dataset[
            ENHANCED_FLAG
        ] = '1';

        installFocusButton(
            table,
            viewport,
            outerScroller,
            updateHeight
        );

        installCopyButton(
            table
        );

        installConfigureCopyButton(
            table
        );

        installSortingAndDragging(
            table,
            table.tHead.rows[0]
        );

        applySavedSort(
            table
        );

        updateHeight();

        if (
            firstEnhancement
        ) {
            outerScroller
                .addEventListener(
                    'scroll',
                    updateHeight,
                    {
                        passive: true
                    }
                );

            window.addEventListener(
                'resize',
                updateHeight,
                {
                    passive: true
                }
            );
        }
    }

    /*
     * ============================================================
     * Angular / MutationObserver
     * ============================================================
     */

    let enhancementScheduled =
        false;

    function scheduleEnhancement() {
        if (
            enhancementScheduled
        ) {
            return;
        }

        enhancementScheduled =
            true;

        requestAnimationFrame(
            () => {
                enhancementScheduled =
                    false;

                enhanceTable();
            }
        );
    }

    const observer =
        new MutationObserver(
            () => {
                scheduleEnhancement();
            }
        );

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

    enhanceTable();
})();