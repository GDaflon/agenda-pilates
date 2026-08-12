'use client';

export default function BottomSheet({
  aberto,
  onFechar,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={`sheet-overlay ${aberto ? 'show' : ''}`} onClick={onFechar} />
      <div className={`sheet ${aberto ? 'show' : ''}`}>
        <div className="sheet-grab" />
        {aberto ? children : null}
      </div>
    </>
  );
}
