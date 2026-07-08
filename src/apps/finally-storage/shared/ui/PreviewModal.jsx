import { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { showAppAlert } from '../../../../shared/ui/appDialog';

const CAPTURE_SCALE = 2;

const waitForStableLayout = async () => {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
};

export function PreviewModal({
  html,
  initialImage = '',
  onClose,
  onGenerated
}) {
  const onGeneratedRef = useRef(onGenerated);
  const [generatedImage, setGeneratedImage] = useState(initialImage);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    document.body.classList.add('preview-open');
    return () => document.body.classList.remove('preview-open');
  }, []);

  useEffect(() => {
    onGeneratedRef.current = onGenerated;
  }, [onGenerated]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);

    const captureHost = document.createElement('div');
    captureHost.className = 'preview-capture-root';
    captureHost.innerHTML = html;
    document.body.appendChild(captureHost);

    const captureNode = captureHost.firstElementChild;

    try {
      if (!captureNode) {
        throw new Error('Capture node not created.');
      }

      await waitForStableLayout();

      const canvas = await html2canvas(captureNode, {
        scale: CAPTURE_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: captureNode.scrollWidth,
        height: captureNode.scrollHeight,
        windowWidth: captureNode.scrollWidth,
        windowHeight: captureNode.scrollHeight
      });

      const dataUrl = canvas.toDataURL('image/png');
      setGeneratedImage(dataUrl);
      onGeneratedRef.current?.({
        dataUrl,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error(error);
      void showAppAlert('Nao foi possivel gerar a pre-visualizacao da imagem.');
    } finally {
      captureHost.remove();
      setIsGenerating(false);
    }
  }, [html]);

  useEffect(() => {
    void handleGenerate();
  }, [handleGenerate]);

  const handleDownload = () => {
    if (!generatedImage) {
      void showAppAlert('Gere a pre-visualizacao antes de baixar.');
      return;
    }

    const anchor = document.createElement('a');
    anchor.download = `fechamento-${new Date().toISOString().slice(0, 10)}.png`;
    anchor.href = generatedImage;
    anchor.click();
  };

  return (
    <div className="preview-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="preview-panel">
        <div className="preview-image-slot">
          {generatedImage ? (
            <img
              className="preview-generated-image"
              src={generatedImage}
              alt="Previa do fechamento"
            />
          ) : (
            <div className="preview-placeholder">
              {isGenerating ? 'Gerando imagem...' : 'A pre-visualizacao aparecera aqui.'}
            </div>
          )}
        </div>

        <div className="preview-controls">
          <button type="button" className="btn-modal-secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="btn-modal-primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Gerando...' : 'Gerar novamente'}
          </button>
          <button type="button" className="btn-modal-primary" onClick={handleDownload} disabled={!generatedImage}>
            Baixar imagem
          </button>
        </div>
      </div>
    </div>
  );
}
