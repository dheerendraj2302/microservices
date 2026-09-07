import Head from "next/head";
import { useRouter } from "next/router";
import styles from "../styles/Dashboard.module.css";

export default function MicroFrontendUnavailablePage() {
  const router = useRouter();
  const name = router.query.name === "Orders" ? "Orders" : "Catalog";

  return (
    <>
      <Head><title>{name} unavailable | Local Customer Portal</title></Head>
      <main className={styles.dashboard} role="alert">
        <p className={styles.eyebrow}>Independent application unavailable</p>
        <h1>{name} is currently unavailable.</h1>
        <p>The customer portal shell is still running. Use the navigation to continue with the other area.</p>
      </main>
    </>
  );
}
