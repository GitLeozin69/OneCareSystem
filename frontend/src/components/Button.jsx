export default function Button({ children, variant = 'secondary', className = '', ...props }) {
  return <button type="button" className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} ${className}`} {...props}>{children}</button>
}
