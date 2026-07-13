// Simple inline SVG icons standing in for the Figma "Tags" component set
// (Prop=Bought, Prop=Fav, Prop=AIgenerated, Prop=Linked). Kept dependency-free
// so nothing relies on Figma's localhost asset server.

export function IconCartCheck({ on, ...props }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M4.49997 10C4.49997 10.55 4.04997 11 3.49997 11C2.94997 11 2.49997 10.55 2.49997 10C2.49997 9.45 2.94997 9 3.49997 9C4.04997 9 4.49997 9.45 4.49997 10ZM8.49997 9C7.94997 9 7.49997 9.45 7.49997 10C7.49997 10.55 7.94997 11 8.49997 11C9.04997 11 9.49997 10.55 9.49997 10C9.49997 9.45 9.04997 9 8.49997 9ZM3.59997 7.4V7.35L4.04997 6.5H7.74997C8.09997 6.5 8.44997 6.3 8.59997 6L10.55 2.5L9.69997 2L7.74997 5.5H4.24997L2.14997 1H0.499969V2H1.49997L3.29997 5.8L2.59997 7C2.54997 7.15 2.49997 7.3 2.49997 7.5C2.49997 8.05 2.94997 8.5 3.49997 8.5H9.49997V7.5H3.69997C3.64997 7.5 3.59997 7.45 3.59997 7.4ZM8.99997 1.4L8.29997 0.700001L5.89997 3.1L4.59997 1.8L3.89997 2.5L5.89997 4.5L8.99997 1.4Z"
        fill={on ? "#00B009" : "#85B287"}
      />
    </svg>
  );
}

export function IconHeart({ on, ...props }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M6.75003 10C3.45003 6.95001 1.75003 5.40001 1.75003 3.55001C1.75003 2.00001 2.95003 0.800011 4.50003 0.800011C5.35003 0.800011 6.20003 1.20001 6.75003 1.85001C7.30003 1.20001 8.15003 0.800011 9.00003 0.800011C10.55 0.800011 11.75 2.00001 11.75 3.55001C11.75 5.45001 10.05 7.00001 6.75003 10ZM6.00003 10.55C2.70003 7.60001 0.750031 5.85001 0.750031 3.50001C0.750031 3.40001 0.750031 3.30001 0.750031 3.20001C0.450031 3.65001 0.250031 4.20001 0.250031 4.80001C0.250031 6.70001 1.95003 8.25001 5.25003 11.2L6.00003 10.55Z"
        fill={on ? "#FF4F6C" : "#B8969C"}
      />
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
