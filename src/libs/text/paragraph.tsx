export const Paragraph = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return (
    <p className={`text-base font-robotoMono ${className}`}>
      {children}
    </p>
  );
}