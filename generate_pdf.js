const { mdToPdf } = require('md-to-pdf');
const fs = require('fs');

(async () => {
    console.log("Starting PDF generation...");
    try {
        const pdf = await mdToPdf(
            { content: fs.readFileSync('architecture.md', 'utf-8') },
            {
                pdf_options: {
                    format: 'A4',
                    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
                    printBackground: true
                }
            }
        ).catch(console.error);

        if (pdf) {
            fs.writeFileSync('Kyllang_Architecture_Overview.pdf', pdf.content);
            console.log("PDF created successfully at Kyllang_Architecture_Overview.pdf");
        }
    } catch (err) {
        console.error("Error generating PDF:", err);
    }
})();
