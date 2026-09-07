export default function ZoneNavigation() {
  const shell = process.env.NEXT_PUBLIC_SHELL_URL ?? "http://localhost:3000";
  return (
    <header className="zoneHeader">
      <a className="zoneBrand" href={shell}>Local Customer Portal</a>
      <nav aria-label="Primary navigation">
        <a href={shell}>Dashboard</a>
        <a aria-current="page" href={`${shell}/catalog`}>Catalog</a>
        <a href={`${shell}/orders`}>Orders</a>
      </nav>
    </header>
  );
}
