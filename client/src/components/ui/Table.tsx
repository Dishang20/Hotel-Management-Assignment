import { ReactNode } from 'react'

interface TableProps {
  headers: string[]
  children: ReactNode
  className?: string
}

export const Table = ({ headers, children, className = '' }: TableProps) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 border-b-2 border-gray-200 dark:border-gray-700">
            {headers.map((header, index) => (
              <th
                key={index}
                className="px-4 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">{children}</tbody>
      </table>
    </div>
  )
}

interface TableRowProps {
  children: ReactNode
  onClick?: () => void
  className?: string
}

export const TableRow = ({ children, onClick, className = '' }: TableRowProps) => {
  return (
    <tr
      onClick={onClick}
      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}

interface TableCellProps {
  children: ReactNode
  className?: string
}

export const TableCell = ({ children, className = '' }: TableCellProps) => {
  return <td className={`px-4 py-4 text-sm text-gray-700 dark:text-gray-300 ${className}`}>{children}</td>
}

