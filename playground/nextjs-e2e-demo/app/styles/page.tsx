import styles from "./card.module.css";
import { ClientCard } from "./client-card.tsx";
import "./global.css";

export default function StylesPage() {
  return (
    <>
      <h1>Styles</h1>
      <p className="global-note">Styled by a global stylesheet</p>
      <p className={styles.card}>Styled by a CSS module in a Server Component</p>
      <ClientCard />
    </>
  );
}
