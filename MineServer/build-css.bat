@echo off
echo Building Tailwind CSS...
npx tailwindcss -i ./src/input.css -o ./src/styles.css --minify
echo Build complete!
pause