import styles from './Footer.module.css';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <span className={styles.text}>Delivery Board</span>
        <span className={styles.separator} />
        <span className={styles.text}>v2.01</span>
        <span className={styles.separator} />
        <span className={styles.text}>{currentYear} <a href="https://github.com/LordCarvel" target="_blank" rel="noopener noreferrer">LordCarvel</a></span>
      </div>
    </footer>
  );
}

export default Footer;
