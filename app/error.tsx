"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-md px-6 py-20"><h1 className="text-2xl font-semibold">Não foi possível carregar o sistema</h1><p className="my-5 text-slate-600">Tente novamente. Se o problema continuar, avise a gerência.</p><button className="primary-button" onClick={reset}>Tentar novamente</button></main>;
}
