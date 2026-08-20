import type { ReactNode } from 'react'
import styles from './WorkspacePage.module.less'

export function WorkspaceTableTitle({
  title,
  description,
  badge,
}: {
  title: string
  description?: string
  badge?: ReactNode
}) {
  return (
    <div className={styles.tableTitle}>
      <div className={styles.tableTitleLine}>
        <strong>{title}</strong>
        {badge}
      </div>
      {description && <span>{description}</span>}
    </div>
  )
}
