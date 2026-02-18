import './Footer.css';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-content">
        <span className="footer-text">Easy Print</span>
        <div className="footer-separator" />
        <span className="footer-text">v1.0</span>
        <div className="footer-separator" />
        <span className="footer-text">© {currentYear} LordCarvel</span>
      </div>
    </footer>
  );
}

