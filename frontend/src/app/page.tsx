'use client';

import { useState } from 'react';
import Link from 'next/link';
import zkpApi, { GeneratedProof } from '@/lib/api';

export default function Home() {
  const [secret, setSecret] = useState('');
  const [publicInputs, setPublicInputs] = useState('');
  const [generatedProof, setGeneratedProof] = useState<GeneratedProof | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const handleGenerateProof = async () => {
    if (!secret.trim()) {
      setGenerateError('please enter a secret value');
      return;
    }

    setGenerating(true);
    setGenerateError('');
    setGeneratedProof(null);

    try {
      const publicInputsArray = publicInputs
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const response = await zkpApi.generateProof({
        secret: secret,
        public_inputs: publicInputsArray,
      });

      if (response.success) {
        setGeneratedProof(response.data);
      } else {
        setGenerateError(response.message || 'failed to generate proof');
      }
    } catch (error: any) {
      setGenerateError(error.response?.data?.detail || error.message || 'failed to generate proof');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!generatedProof) return;
    
    setDownloading(true);
    
    try {
      const { jsPDF } = await import('jspdf');
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Minimalist PDF design
      doc.setFontSize(20);
      doc.setTextColor(0, 0, 0);
      doc.text('Kyllang Proof Certificate', pageWidth / 2, 30, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text('zero-knowledge proof', pageWidth / 2, 40, { align: 'center' });
      
      // Line
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(20, 50, pageWidth - 20, 50);
      
      // Details
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      
      doc.setFont('helvetica', 'bold');
      doc.text('proof id', 20, 65);
      doc.setFont('helvetica', 'normal');
      doc.text(generatedProof.proof_id, 20, 72);
      
      doc.setFont('helvetica', 'bold');
      doc.text('created', 20, 85);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(generatedProof.created_at).toLocaleString(), 20, 92);
      
      doc.setFont('helvetica', 'bold');
      doc.text('commitment', 20, 105);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      const commitmentLines = doc.splitTextToSize(generatedProof.commitment, pageWidth - 40);
      doc.text(commitmentLines, 20, 112);
      
      const proofStartY = 112 + (commitmentLines.length * 4) + 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('proof data', 20, proofStartY);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      
      doc.text('R:', 20, proofStartY + 8);
      const rLines = doc.splitTextToSize(generatedProof.proof.R, pageWidth - 40);
      doc.text(rLines, 25, proofStartY + 14);
      
      const sStartY = proofStartY + 14 + (rLines.length * 4) + 6;
      doc.text('s:', 20, sStartY);
      const sLines = doc.splitTextToSize(generatedProof.proof.s, pageWidth - 40);
      doc.text(sLines, 25, sStartY + 6);
      
      const challengeStartY = sStartY + 6 + (sLines.length * 4) + 6;
      doc.text('challenge:', 20, challengeStartY);
      const challengeLines = doc.splitTextToSize(generatedProof.proof.challenge, pageWidth - 40);
      doc.text(challengeLines, 25, challengeStartY + 6);
      
      const signalsStartY = challengeStartY + 6 + (challengeLines.length * 4) + 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('public signals', 20, signalsStartY);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      const signalsText = generatedProof.public_signals.join('\n');
      const signalsLines = doc.splitTextToSize(signalsText, pageWidth - 40);
      doc.text(signalsLines, 20, signalsStartY + 8);
      
      // Page 2 - JSON data for verification
      doc.addPage();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Verification Data', 20, 25);
      
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text('upload this pdf to verify the proof', 20, 33);
      
      doc.setFontSize(7);
      doc.setFont('courier', 'normal');
      doc.setTextColor(60, 60, 60);
      
      doc.text('--- BEGIN ZKP PROOF DATA ---', 20, 48);
      
      const verificationData = {
        proof: generatedProof.proof,
        public_signals: generatedProof.public_signals,
        commitment: generatedProof.commitment,
        public_inputs: generatedProof.public_inputs || []
      };
      const jsonString = JSON.stringify(verificationData, null, 2);
      const jsonLines = doc.splitTextToSize(jsonString, pageWidth - 40);
      doc.text(jsonLines, 20, 56);
      
      const jsonEndY = 56 + (jsonLines.length * 4) + 8;
      doc.text('--- END ZKP PROOF DATA ---', 20, jsonEndY);
      
      doc.save(`kyllang-proof-${generatedProof.proof_id.slice(0, 8)}.pdf`);
      
    } catch (error) {
      console.error('failed to generate pdf:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-2xl font-medium text-white mb-2">
          generate proof
        </h1>
        <p className="text-neutral-500 text-sm">
          create a zero-knowledge proof that proves you know a secret without revealing it
        </p>
      </div>

      {/* Form */}
      <div className="space-y-6">
        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="enter your secret"
            className="input-field"
          />
          <p className="text-xs text-neutral-600 mt-2">
            this will not be revealed in the proof
          </p>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            public inputs <span className="text-neutral-600">(optional)</span>
          </label>
          <input
            type="text"
            value={publicInputs}
            onChange={(e) => setPublicInputs(e.target.value)}
            placeholder="e.g. user123, 2026-02-17, txn_abc"
            className="input-field"
          />
          <p className="text-xs text-neutral-600 mt-2">
            comma-separated values that will be public in the proof
          </p>
        </div>
        
        <button
          onClick={handleGenerateProof}
          disabled={generating}
          className="btn-primary w-full"
        >
          {generating ? 'generating...' : 'generate proof'}
        </button>
      </div>

      {/* Generated Proof */}
      {generatedProof && (
        <div className="mt-12 pt-12 border-t border-neutral-900">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-white">proof generated</h2>
            <span className="badge-success">success</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider">proof id</label>
              <div className="code-block text-neutral-300 mt-1 break-all">
                {generatedProof.proof_id}
              </div>
            </div>

            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider">commitment</label>
              <div className="code-block text-neutral-400 mt-1 break-all text-xs">
                {generatedProof.commitment}
              </div>
            </div>

            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider">proof</label>
              <div className="code-block text-neutral-400 mt-1 text-xs">
                <pre className="whitespace-pre-wrap">{JSON.stringify(generatedProof.proof, null, 2)}</pre>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <button
                onClick={handleDownloadPDF}
                disabled={downloading}
                className="btn-primary w-full"
              >
                {downloading ? 'generating pdf...' : 'download certificate'}
              </button>

              <Link
                href="/verify"
                className="btn-secondary w-full block text-center"
              >
                verify this proof
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
