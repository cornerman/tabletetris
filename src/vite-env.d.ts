/// <reference types="vite/client" />

// Add this declaration to handle SVG imports as React components
declare module '*.svg?react' {
    import * as React from 'react';
    const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
    export default ReactComponent;
} 