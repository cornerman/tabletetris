import { defineConfig } from 'vite'

export default defineConfig({
    // Set the project root to the 'docs' directory
    root: 'src',
    // Configure build options
    build: {
        // Output directory relative to the root
        outDir: '../dist',
        // Ensure the output directory is emptied before building
        emptyOutDir: true,
    },
    // Configure server options (for development)
    server: {
        // Open the browser automatically when the server starts
        open: true,
    }
}) 