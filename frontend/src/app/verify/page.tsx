'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import zkpApi, { VerificationResult } from '@/lib/api';

interface ExtractedProofData {
  proof: {
    R: string;
    s: string;
    challenge: string;
  };
  public_signals: string[];
  commitment: string;
  public_inputs: string[];
}

export default function VerifyPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedProofData | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  
  const [manualMode, setManualMode] = useState(false);
  const [verifyProofJson, setVerifyProofJson] = useState('');
  const [verifyPublicSignals, setVerifyPublicSignals] = useState('');
  const [verifyCommitment, setVerifyCommitment] = useState('');
  const [verifyPublicInputs, setVerifyPublicInputs] = useState('');
  
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setExtractError('');
      setExtractedData(null);
      setVerificationResult(null);
    } else {
      setExtractError('please select a valid pdf file');
    }
  };

  const handleExtractFromPDF = async () => {
    if (!selectedFile) return;
    
    setExtracting(true);
    setExtractError('');
    setExtractedData(null);
    
    try {
      const text = await readPDFAsText(selectedFile);
      
      const startMarker = '--- BEGIN ZKP PROOF DATA ---';
      const endMarker = '--- END ZKP PROOF DATA ---';
      
      const startIndex = text.indexOf(startMarker);
      const endIndex = text.indexOf(endMarker);
      
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('could not find proof data in pdf');
      }
      
      const jsonString = text.substring(startIndex + startMarker.length, endIndex).trim();
      const data = JSON.parse(jsonString) as ExtractedProofData;
      
      if (!data.proof || !data.public_signals || !data.commitment) {
        throw new Error('invalid proof structure');
      }
      
      // Ensure public_inputs is set (may be empty array)
      if (!data.public_inputs) {
        data.public_inputs = [];
      }
      
      setExtractedData(data);
      setVerifyProofJson(JSON.stringify(data.proof, null, 2));
      setVerifyPublicSignals(data.public_signals.join(', '));
      setVerifyCommitment(data.commitment);
      setVerifyPublicInputs(data.public_inputs.join(', '));
      
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        setExtractError('failed to parse proof data');
      } else {
        setExtractError(error.message || 'failed to extract proof');
      }
    } finally {
      setExtracting(false);
    }
  };

  const readPDFAsText = async (file: File): Promise<string> => {
    // Use pdfjs-dist to properly extract text from PDF
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    // Look for the proof data markers
    const beginMarker = '--- BEGIN ZKP PROOF DATA ---';
    const endMarker = '--- END ZKP PROOF DATA ---';
    
    const beginIdx = fullText.indexOf(beginMarker);
    const endIdx = fullText.indexOf(endMarker);
    
    if (beginIdx !== -1 && endIdx !== -1) {
      let jsonStr = fullText.substring(beginIdx + beginMarker.length, endIdx);
      // Clean up spacing issues from PDF text extraction
      jsonStr = jsonStr
        .replace(/\s+/g, ' ')
        .replace(/"\s*:\s*/g, '": ')
        .replace(/,\s*/g, ', ')
        .replace(/\{\s*/g, '{ ')
        .replace(/\s*\}/g, ' }')
        .replace(/\[\s*/g, '[ ')
        .replace(/\s*\]/g, ' ]')
        .trim();
      
      // Try to parse, if fails try to reconstruct
      try {
        JSON.parse(jsonStr);
        return `${beginMarker}\n${jsonStr}\n${endMarker}`;
      } catch {
        // Fall through to reconstruction
      }
    }
    
    // Try to extract individual values using regex
    const rMatch = fullText.match(/["']?R["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    const sMatch = fullText.match(/["']?s["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    const challengeMatch = fullText.match(/["']?challenge["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    const commitmentMatch = fullText.match(/["']?commitment["']?\s*:\s*["'](0x[a-fA-F0-9]+)["']/);
    
    // Extract public_inputs array
    const publicInputsMatch = fullText.match(/["']?public_inputs["']?\s*:\s*\[([^\]]*)\]/);
    let publicInputs: string[] = [];
    if (publicInputsMatch && publicInputsMatch[1].trim()) {
      const inputsStr = publicInputsMatch[1];
      const stringMatches = inputsStr.match(/["']([^"']+)["']/g);
      if (stringMatches) {
        publicInputs = stringMatches.map(s => s.replace(/["']/g, ''));
      }
    }
    
    // Extract public_signals array
    const signalsMatch = fullText.match(/["']?public_signals["']?\s*:\s*\[([^\]]*)\]/);
    let signals: string[] = [];
    if (signalsMatch) {
      const hexMatches = signalsMatch[1].match(/0x[a-fA-F0-9]+/g);
      if (hexMatches) signals = hexMatches;
    }
    
    if (rMatch && sMatch && challengeMatch && commitmentMatch) {
      if (signals.length === 0) signals = [commitmentMatch[1]];
      
      const reconstructed = {
        proof: {
          R: rMatch[1],
          s: sMatch[1],
          challenge: challengeMatch[1]
        },
        public_signals: signals,
        commitment: commitmentMatch[1],
        public_inputs: publicInputs
      };
      
      return `${beginMarker}\n${JSON.stringify(reconstructed, null, 2)}\n${endMarker}`;
    }
    
    throw new Error('could not find proof data in pdf. try manual input.');
  };

  const handleVerifyProof = async () => {
    let proof, publicSignalsArray, commitment, publicInputsArray;
    
    if (extractedData && !manualMode) {
      proof = extractedData.proof;
      publicSignalsArray = extractedData.public_signals;
      commitment = extractedData.commitment;
      publicInputsArray = extractedData.public_inputs || [];
    } else {
      if (!verifyProofJson.trim() || !verifyCommitment.trim()) {
        setVerifyError('please fill in all required fields');
        return;
      }
      
      try {
        proof = JSON.parse(verifyProofJson);
      } catch {
        setVerifyError('invalid json format');
        return;
      }
      
      publicSignalsArray = verifyPublicSignals
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      commitment = verifyCommitment;
      publicInputsArray = verifyPublicInputs
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
    }

    setVerifying(true);
    setVerifyError('');
    setVerificationResult(null);

    try {
      const response = await zkpApi.verifyProof({
        proof: proof,
        public_signals: publicSignalsArray,
        commitment: commitment,
        public_inputs: publicInputsArray,
      });

      if (response.success) {
        setVerificationResult(response.data);
      } else {
        setVerifyError(response.message || 'verification failed');
      }
    } catch (error: any) {
      setVerifyError(error.response?.data?.detail || error.message || 'verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setExtractedData(null);
    setExtractError('');
    setVerifyProofJson('');
    setVerifyPublicSignals('');
    setVerifyCommitment('');
    setVerifyPublicInputs('');
    setVerificationResult(null);
    setVerifyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="mb-12">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors mb-4 inline-block">
          ← back
        </Link>
        <h1 className="text-2xl font-medium text-white mb-2">
          verify proof
        </h1>
        <p className="text-neutral-500 text-sm">
          upload a kyllang proof certificate or enter data manually to verify
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex mb-8 border border-neutral-800 rounded-lg p-1">
        <button
          onClick={() => setManualMode(false)}
          className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
            !manualMode
              ? 'bg-white text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          upload pdf
        </button>
        <button
          onClick={() => setManualMode(true)}
          className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
            manualMode
              ? 'bg-white text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          manual input
        </button>
      </div>

      {!manualMode ? (
        /* PDF Upload */
        <div className="space-y-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-neutral-700 rounded-lg p-12 text-center cursor-pointer hover:border-neutral-500 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {selectedFile ? (
              <div>
                <p className="text-white">{selectedFile.name}</p>
                <p className="text-neutral-500 text-sm mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-neutral-400">click to upload pdf</p>
                <p className="text-neutral-600 text-sm mt-1">or drag and drop</p>
              </div>
            )}
          </div>

          {extractError && (
            <div className="text-red-500 text-sm">
              {extractError}
            </div>
          )}

          {selectedFile && !extractedData && (
            <button
              onClick={handleExtractFromPDF}
              disabled={extracting}
              className="btn-primary w-full"
            >
              {extracting ? 'extracting...' : 'extract proof data'}
            </button>
          )}

          {extractedData && (
            <div className="space-y-4">
              <div className="text-green-500 text-sm">
                ✓ proof data extracted
              </div>
              
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider">commitment</label>
                <div className="code-block text-neutral-400 mt-1 break-all text-xs">
                  {extractedData.commitment}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Manual Input */
        <div className="space-y-6">
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              proof (json)
            </label>
            <textarea
              value={verifyProofJson}
              onChange={(e) => setVerifyProofJson(e.target.value)}
              placeholder='{"R": "0x...", "s": "0x...", "challenge": "0x..."}'
              rows={4}
              className="input-field font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              public signals <span className="text-neutral-600">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={verifyPublicSignals}
              onChange={(e) => setVerifyPublicSignals(e.target.value)}
              placeholder="e.g. 0x1234..., 0x5678..."
              className="input-field font-mono text-xs"
            />
            <p className="text-xs text-neutral-600 mt-2">
              the hex values from proof generation
            </p>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              commitment
            </label>
            <input
              type="text"
              value={verifyCommitment}
              onChange={(e) => setVerifyCommitment(e.target.value)}
              placeholder="0x..."
              className="input-field font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              public inputs <span className="text-neutral-600">(comma-separated, optional)</span>
            </label>
            <input
              type="text"
              value={verifyPublicInputs}
              onChange={(e) => setVerifyPublicInputs(e.target.value)}
              placeholder="e.g. hello, world"
              className="input-field font-mono text-xs"
            />
            <p className="text-xs text-neutral-600 mt-2">
              the original public inputs used during proof generation
            </p>
          </div>
        </div>
      )}

      {verifyError && (
        <div className="text-red-500 text-sm mt-4">
          {verifyError}
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 space-y-3">
        <button
          onClick={handleVerifyProof}
          disabled={verifying || (!extractedData && !manualMode) || (manualMode && (!verifyProofJson || !verifyCommitment))}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verifying ? 'verifying...' : 'verify proof'}
        </button>

        {(selectedFile || extractedData || verificationResult) && (
          <button
            onClick={handleReset}
            className="btn-secondary w-full"
          >
            reset
          </button>
        )}
      </div>

      {/* Result */}
      {verificationResult && (
        <div className="mt-12 pt-12 border-t border-neutral-900">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-white">result</h2>
            <span className={verificationResult.valid ? 'badge-success' : 'badge-error'}>
              {verificationResult.valid ? 'valid' : 'invalid'}
            </span>
          </div>

          <div className={`rounded-lg p-6 ${verificationResult.valid ? 'bg-green-500/5 border border-green-500/20' : 'bg-red-500/5 border border-red-500/20'}`}>
            <p className={`text-lg font-medium ${verificationResult.valid ? 'text-green-500' : 'text-red-500'}`}>
              {verificationResult.valid ? 'proof is valid' : 'proof is invalid'}
            </p>
            <p className="text-neutral-500 text-sm mt-1">
              {verificationResult.message}
            </p>
            <p className="text-neutral-600 text-xs mt-3">
              verified at {new Date(verificationResult.verified_at).toLocaleString()}
            </p>
          </div>

          {verificationResult.details && (
            <div className="mt-6">
              <label className="text-xs text-neutral-500 uppercase tracking-wider">details</label>
              <div className="code-block mt-2 text-xs">
                <div className="flex justify-between py-2 border-b border-neutral-800">
                  <span className="text-neutral-500">challenge valid</span>
                  <span className={verificationResult.details.challenge_valid ? 'text-green-500' : 'text-red-500'}>
                    {verificationResult.details.challenge_valid ? 'yes' : 'no'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-neutral-800">
                  <span className="text-neutral-500">proof structure</span>
                  <span className={verificationResult.details.proof_structure_valid ? 'text-green-500' : 'text-red-500'}>
                    {verificationResult.details.proof_structure_valid ? 'valid' : 'invalid'}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-neutral-500">commitment verified</span>
                  <span className={verificationResult.details.commitment_verified ? 'text-green-500' : 'text-red-500'}>
                    {verificationResult.details.commitment_verified ? 'yes' : 'no'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
