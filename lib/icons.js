// Simple inline SVG icons standing in for the Figma "Tags" component set
// (Prop=Bought, Prop=Fav, Prop=AIgenerated, Prop=Linked). Kept dependency-free
// so nothing relies on Figma's localhost asset server.

export function IconCartCheck(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M1 1h1.2l.9 1.6M4.1 3.6h9.4l-1.3 5.2H5.3M4.1 3.6l1.2 5.2m0 0a1.3 1.3 0 1 0 0 2.6h6.4"
        stroke="#2a7a2a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="6.5" cy="13.4" r="0.9" fill="#2a7a2a" />
      <circle cx="11.5" cy="13.4" r="0.9" fill="#2a7a2a" />
      <path d="M8.5 8.6l1.1 1.1 2-2.2" stroke="#2a7a2a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function IconHeart(props) {
  return (
    <svg viewBox="0 0 16 16" fill="#a33" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8 13.8s-5.6-3.4-5.6-7.2a3.1 3.1 0 0 1 5.6-1.8 3.1 3.1 0 0 1 5.6 1.8c0 3.8-5.6 7.2-5.6 7.2z" />
    </svg>
  );
}

export function IconSparkle(props) {
  return (
    <svg viewBox="0 0 16 16" fill="#3e60ff" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8 2.2c.3 1.7 1 3 2 4 1 1 2.3 1.7 4 2-1.7.3-3 1-4 2-1 1-1.7 2.3-2 4-.3-1.7-1-3-2-4-1-1-2.3-1.7-4-2 1.7-.3 3-1 4-2 1-1 1.7-2.3 2-4z" />
    </svg>
  );
}

export function IconLink(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M6.3 9.7 9.7 6.3M6.9 5.3 8 4.2a2.1 2.1 0 0 1 3 3l-1.1 1.1M9.1 10.7 8 11.8a2.1 2.1 0 0 1-3-3l1.1-1.1"
        stroke="#3e60ff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
