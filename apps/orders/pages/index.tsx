import Head from "next/head";
import OrdersApp from "../src/OrdersApp";
import ZoneNavigation from "../src/ZoneNavigation";

export default function OrdersPage() {
  return <><Head><title>Orders | Local Customer Portal</title></Head><ZoneNavigation /><OrdersApp /></>;
}
