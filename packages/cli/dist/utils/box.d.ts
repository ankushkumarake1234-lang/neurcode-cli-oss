/**
 * Box utility for creating terminal boxes
 * Creates high-contrast, professional-looking boxes using chalk
 */
export interface BoxOptions {
    title?: string;
    padding?: number;
    borderColor?: 'green' | 'yellow' | 'red' | 'cyan' | 'white';
    titleColor?: 'green' | 'yellow' | 'red' | 'cyan' | 'white';
    align?: 'left' | 'center';
}
/**
 * Create a boxed message for terminal output
 */
export declare function createBox(content: string, options?: BoxOptions): string;
//# sourceMappingURL=box.d.ts.map