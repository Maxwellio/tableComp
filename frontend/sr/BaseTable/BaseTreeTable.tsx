import type { ColumnDef, ExpandedState, VisibilityState } from "@tanstack/react-table";
import { flexRender, getCoreRowModel, getExpandedRowModel, getPaginationRowModel, TableOptions, useReactTable } from "@tanstack/react-table";
import React, { useState } from "react";
import { useFetchData } from "../BaseTable/hooks/useFetchTreeData";

interface BaseTreeTableProps<TData> extends Partial<TableOptions<TData>>{
    url: string;
    // Правка 1. Корень дерева больше не захардкожен в компоненте.
    // Не задан — дерево запрашивается целиком по `${url}`.
    rootId?: number | string;
    columns: ColumnDef<TData>[];
    setSelectedId?: any;
    setIsLeaf?:any;
    defColumnVisibility?: VisibilityState;
}

export const BaseTreeTable = <TData,>({url, rootId, columns, setSelectedId, setIsLeaf, defColumnVisibility, ...props}: BaseTreeTableProps<TData>) =>{
    // Правка 1. Было useFetchData<TData>(url, 1000242) — id конкретной записи
    // одного проекта, из-за чего компонент нельзя было переиспользовать.
    // setData/fetchChildren больше не нужны здесь: ленивая догрузка убрана (правка 2).
    const {data, loading} = useFetchData<TData>(url, rootId);
    // ExpandedState вместо {}: TanStack кладёт сюда либо карту id→boolean,
    // либо булево true (при «развернуть всё»).
    const [expanded, setExpanded] = useState<ExpandedState>({});
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(defColumnVisibility || {})
    const table = useReactTable({
        data,
        columns,
        state: {
            expanded,
            columnVisibility,
         },
        getCoreRowModel: getCoreRowModel(),
        // Правка 3. Было getRowCanExpand: row => row.original.hasChildren.
        // TanStack применяет к результату ??, поэтому undefined корректно уходил
        // в дефолт по subRows, а вот hasChildren: false запрещал раскрытие даже
        // у узла с реально загруженными детьми. При полной загрузке дерева
        // источник истины — subRows, hasChildren остаётся приоритетной подсказкой
        // для будущего ленивого режима.
        //@ts-ignore
        getRowCanExpand: row => row.original.hasChildren ?? row.subRows.length > 0,
        getExpandedRowModel: getExpandedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        //@ts-ignore
        getSubRows: row => row.children,
        // Правка 2. Раньше здесь вручную вызывалась догрузка детей раскрываемого
        // узла. При полной загрузке дерева эта ветка мертва, а её код падал:
        // updater считался функцией всегда, тогда как table.toggleAllRowsExpanded()
        // передаёт сюда голое true. Сеттер useState корректно принимает и функцию,
        // и значение, поэтому «развернуть всё» теперь работает.
        onExpandedChange: setExpanded,
        manualPagination: true,
        enableSubRowSelection: false,
        ...props,
    });

    const handleRowClick = (row) => {        
        if (row.id){
            if(setSelectedId){
                setSelectedId(row.original.id);
            }
            // Правка 5. setIsLeaf объявлен необязательным, но вызывался безусловно —
            // без пропса компонент падал на первом же клике по строке.
            // Признак листа берём у самой строки, а не у поля hasChildren:
            // при полной загрузке дерева поля может не быть вовсе.
            if (setIsLeaf){
                setIsLeaf(!row.getCanExpand());
            }
        }        
    };
    
    return(
        <div className="min-w-full min-h-full overflow-auto">
        <table className="min-w-full bg-white rounded-lg table-auto">
            <thead className="bg-gray-100 text-white">
                {table.getHeaderGroups().map(headerGroup => (
                        <tr key = {headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th key = {header.id}
                                className=" px-1 py-2 text-center shrink-0 overflow-hidden text-ellipsis bg-[#F0F4FF] text-[#364FC7] border border-t font-medium text-sm whitespace-pre-line break-words hyphens-auto">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                </th>    
                            ))}
                        </tr>
                ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {table.getRowModel().rows.map(row =>(
                    <tr key = {row.id} 
                    className={`hover:bg-[#E7F0FF] transition-colors duration-150 
                        ${row.getIsSelected()
                        ? 'bg-[#D0EBFF] even:bg-[#D0EBFF] hover:bg-[#B1D7FF] shadow-[inset_3px_0_0_0_#364FC7]'
                        : 'bg-white even:bg-[#F8FAFF]'}
                    `}
                        onClick={(e) => {
                        if (!row.getIsSelected()){
                            table.resetRowSelection();
                        }
                        row.toggleSelected(true);}}
                    >
                        {row.getVisibleCells().map(cell => (
                            <td key = {cell.id} 
                                onClick={() => handleRowClick(row)}
                                className="px-4 py-2 border text-sm text-gray- overflow-hedden overflow-ellipsis whitespase-nowrap"
                            >
                                <div className="max-h-10 overflow-y-auto">{flexRender(cell.column.columnDef.cell, cell.getContext())} </div>
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
    );
};

interface TreeExpanderColumnOptions {
    /** Поле узла, значение которого показывается рядом со стрелкой. */
    accessorKey?: string;
    /** Заголовок колонки. */
    header?: string;
    /** Отступ в пикселях на каждый уровень вложенности. */
    indent?: number;
    /** id колонки — на случай, если '__expander' с чем-то конфликтует. */
    id?: string;
}

/**
 * Правка 4. Колонка-экспандер: стрелка раскрытия + отступ по уровню вложенности.
 *
 * BaseTreeTable рисует только те ячейки, что описаны в columns, а ни стрелки,
 * ни отступа по row.depth среди них не было — раскрывать дерево было нечем,
 * и уровни визуально не различались. Раньше каждый потребитель писал такую
 * колонку у себя; теперь она поставляется вместе с компонентом.
 *
 * Использование: columns={[ treeExpanderColumn({ accessorKey: 'nm', header: 'Наименование' }), ...остальные ]}
 */
export const treeExpanderColumn = <TData,>(options: TreeExpanderColumnOptions = {}): ColumnDef<TData> => {
    const { accessorKey = 'name', header = '', indent = 20, id = '__expander' } = options;
    return {
        id,
        header,
        cell: ({ row }) => (
            // row.depth даёт уровень вложенности — глубина при этом ничем не ограничена.
            <div className="flex items-center gap-1" style={{ paddingLeft: row.depth * indent }}>
                {row.getCanExpand() ? (
                    <button
                        type="button"
                        // stopPropagation обязателен: без него клик по стрелке всплывает
                        // до <td>/<tr> и заодно выделяет строку и дёргает handleRowClick.
                        onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
                        aria-label={row.getIsExpanded() ? 'Свернуть' : 'Развернуть'}
                        aria-expanded={row.getIsExpanded()}
                        className="w-4 shrink-0 leading-none text-[#364FC7]"
                    >
                        {row.getIsExpanded() ? '▾' : '▸'}
                    </button>
                ) : (
                    // Пустышка той же ширины, чтобы подписи листьев и веток были выровнены.
                    <span className="w-4 shrink-0" />
                )}
                <span>{(row.original as any)?.[accessorKey]}</span>
            </div>
        ),
    };
};
