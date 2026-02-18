export class Printer {
  static iframe = null;

  static ensureIframe() {
    if (!this.iframe) {
      this.iframe = document.createElement('iframe');
      this.iframe.style.position = 'absolute';
      this.iframe.style.width = '0';
      this.iframe.style.height = '0';
      this.iframe.style.border = '0';
      document.body.appendChild(this.iframe);
    }
    return this.iframe;
  }
  static generateHTMLFromPreview(previewHtml) {
    return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Print</title>
          <style>
            @page { margin: 0; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 11px; }
            .print-wrapper { width: 240px; padding: 4px; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          </style>
        </head>
        <body>
          <div class="print-wrapper">
            ${previewHtml}
          </div>
        </body>
      </html>
    `;
  }

  static printHTML(html) {
    const iframe = this.ensureIframe();
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) return;

    const doc = iframeWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    iframeWindow.focus();
    iframeWindow.print();
  }

  static printPreview(previewHtml) {
    if (!previewHtml) return;
    const html = this.generateHTMLFromPreview(previewHtml);
    this.printHTML(html);
  }
}

