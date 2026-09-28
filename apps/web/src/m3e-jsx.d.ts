import type * as React from 'react';

type Any = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, any>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'm3e-icon': Any;
      'm3e-tooltip': Any;
      'm3e-badge': Any;
      'm3e-shape': Any;
      'm3e-divider': Any;
      [key: `m3e-${string}`]: Any;
    }
  }
}
export {};
