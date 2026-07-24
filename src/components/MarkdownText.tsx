import ReactMarkdown from 'react-markdown'

export function MarkdownText({ children, className }: { children: string; className?: string }) {
  return <div className={`markdown-doc${className ? ` ${className}` : ''}`}><ReactMarkdown skipHtml>{children}</ReactMarkdown></div>
}
