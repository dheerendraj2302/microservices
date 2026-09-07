import Head from "next/head";
import CatalogApp from "../src/CatalogApp";
import ZoneNavigation from "../src/ZoneNavigation";

export default function CatalogPage() {
  return <><Head><title>Catalog | Local Customer Portal</title></Head><ZoneNavigation /><CatalogApp /></>;
}
