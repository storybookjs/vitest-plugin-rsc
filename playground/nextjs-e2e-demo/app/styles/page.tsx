import styles from "./card.module.css";
import { ClientCard } from "./client-card.tsx";
import "./global.css";
import "styled-package/reset";
import { Badge } from "styled-package/badge";
import { ClientBadge } from "styled-package/client-badge";

export default function StylesPage() {
  return (
    <>
      <h1>Styles</h1>
      <p className="global-note">Styled by a global stylesheet</p>
      <p className={styles.card}>Styled by a CSS module in a Server Component</p>
      <ClientCard />
      <p className="package-reset">Styled by the stylesheet of a package</p>
      <Badge>Styled by the CSS of a component of a package</Badge>
      <ClientBadge>Styled by the CSS of a Client Component of a package</ClientBadge>
    </>
  );
}
