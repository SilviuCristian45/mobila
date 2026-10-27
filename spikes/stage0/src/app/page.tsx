export default function Home() {
  return (
    <main className="p-6" data-testid="home">
      <h1 className="text-2xl font-bold text-teal-700" data-testid="home-title">Spike Etapa 0 — pagina de start</h1>
      <p>Pagina de start nu încarcă Konva/Three/Dexie.</p>
      {/* <a>, nu <Link>: navigarea soft către o rută cu query cere un payload RSC care dă 404 pe o gazdă statică strictă (constatare I9) */}
      <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/editor/?p=demo`} data-testid="to-editor">Deschide editorul (p=demo)</a>
    </main>
  );
}
