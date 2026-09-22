export function Logo({ compact = false }) {
  return (
    <div className="brand-lockup" aria-label="Gallery of Us">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>Gallery of Us</strong>
          <small>Private memory archive</small>
        </span>
      )}
    </div>
  );
}
