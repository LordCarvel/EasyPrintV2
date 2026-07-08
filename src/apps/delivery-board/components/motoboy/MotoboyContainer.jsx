import styles from './MotoboyContainer.module.css';

function MotoboyContainer({ children }) {
  return (
    <section id="motoboyContainer" className={styles.motoboyContainer}>
      {children}
    </section>
  );
}

export default MotoboyContainer;
