import ReactMarkdown from 'react-markdown'

export function MarkdownText({ children, className, demoteHeadings = false }: { children: string; className?: string; demoteHeadings?: boolean }) {
  return <div className={`markdown-doc${className ? ` ${className}` : ''}`}><ReactMarkdown
    skipHtml
    components={demoteHeadings ? {
      h1: ({ children: heading }) => <h3>{heading}</h3>,
      h2: ({ children: heading }) => <h3>{heading}</h3>,
      h3: ({ children: heading }) => <h4>{heading}</h4>,
    } : undefined}
  >{children}</ReactMarkdown></div>
}
