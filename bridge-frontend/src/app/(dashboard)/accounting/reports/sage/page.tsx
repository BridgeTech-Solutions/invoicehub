'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileText, CheckSquare, Square, Loader2, Eye } from 'lucide-react'
import { useJournals, useFiscalYears } from '@/features/accounting/hooks'
import { accountingApi } from '@/features/accounting/api'
import { ROUTES } from '@/lib/constants'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { toast } from 'sonner'
import type { ExportFormat, ExportConfig } from '@/features/accounting/types'

const FORMAT_OPTIONS: { value: ExportFormat; label: string; desc: string; ext: string }[] = [
  { value: 'sage100', label: 'Sage 100',       desc: 'Format natif Sage Comptabilité 100 (ligne fixe)',          ext: '.txt' },
  { value: 'csv',     label: 'CSV Standard',    desc: 'Séparateur point-virgule, compatible Excel / LibreOffice', ext: '.csv' },
  { value: 'fec',     label: 'FEC (DGI/France)', desc: 'Fichier des Écritures Comptables — norme DGI française', ext: '.txt' },
]

const ENCODING_OPTIONS: { value: 'utf-8' | 'latin-1'; label: string; desc: string }[] = [
  { value: 'utf-8',   label: 'UTF-8',     desc: 'Recommandé — supporte tous les caractères' },
  { value: 'latin-1', label: 'Latin-1',   desc: 'Compatibilité Sage ancienne version' },
]

// Simulated preview lines per format
function buildPreviewLines(format: ExportFormat): string[] {
  if (format === 'sage100') return [
    'JNL|DATE    |PIECE       |CPTE       |LIBELLE                        |DEBIT      |CREDIT     ',
    'AC |20260105|AC001       |40100SABC  |Facture SABC janv 2026         |       0.00|   25000.00',
    'AC |20260105|AC001       |60100000   |Achats matières premières      |   25000.00|       0.00',
    'BQ |20260112|BQ015       |51200BTS   |Paiement facture SABC          |       0.00|   25000.00',
    'BQ |20260112|BQ015       |40100SABC  |Paiement facture SABC          |   25000.00|       0.00',
  ]
  if (format === 'fec') return [
    'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|Debit|Credit|EcritureLet',
    'AC|Achats|AC001|20260105|401SABC|Fournisseur SABC|0.00|25000.00|',
    'AC|Achats|AC001|20260105|6010|Achats|25000.00|0.00|',
    'BQ|Banque|BQ015|20260112|5120|Banque BTS|0.00|25000.00|',
    'BQ|Banque|BQ015|20260112|401SABC|Fournisseur SABC|25000.00|0.00|',
  ]
  return [
    'JNL;DATE;PIECE;COMPTE;LIBELLE;DEBIT;CREDIT',
    'AC;2026-01-05;AC001;401SABC;Facture SABC janv 2026;0.00;25000.00',
    'AC;2026-01-05;AC001;6010;Achats matières premières;25000.00;0.00',
    'BQ;2026-01-12;BQ015;5120;Paiement SABC;0.00;25000.00',
    'BQ;2026-01-12;BQ015;401SABC;Paiement SABC;25000.00;0.00',
  ]
}

export default function SageExportPage() {
  const { can } = usePermission()
  const { data: journals = [] }    = useJournals()
  const { data: fiscalYears = [] } = useFiscalYears()

  const currentYear = fiscalYears.find(y => y.status === 'open' || y.status === 'current') ?? fiscalYears[0]

  const [dateFrom, setDateFrom]     = useState(currentYear ? `${currentYear.year}-01-01` : '')
  const [dateTo, setDateTo]         = useState(currentYear ? `${currentYear.year}-12-31` : '')
  const [selectedJournals, setSelectedJournals] = useState<Set<string>>(new Set())
  const [format, setFormat]         = useState<ExportFormat>('csv')
  const [encoding, setEncoding]     = useState<'utf-8' | 'latin-1'>('utf-8')
  const [showPreview, setShowPreview] = useState(true)
  const [exporting, setExporting]   = useState(false)

  // Select all journals by default when loaded
  useEffect(() => {
    if (journals.length && selectedJournals.size === 0) {
      setSelectedJournals(new Set(journals.map(j => j.id)))
    }
  }, [journals])

  useEffect(() => {
    if (currentYear) {
      setDateFrom(`${currentYear.year}-01-01`)
      setDateTo(`${currentYear.year}-12-31`)
    }
  }, [currentYear])

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  function toggleJournal(id: string) {
    setSelectedJournals(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedJournals.size === journals.length) setSelectedJournals(new Set())
    else setSelectedJournals(new Set(journals.map(j => j.id)))
  }

  async function handleExport() {
    if (!dateFrom || !dateTo) { toast.error('Sélectionnez une période'); return }
    if (selectedJournals.size === 0) { toast.error('Sélectionnez au moins un journal'); return }

    const config: ExportConfig = {
      dateFrom, dateTo,
      journals: Array.from(selectedJournals),
      format, encoding,
    }

    setExporting(true)
    try {
      const res = await accountingApi.exportSage(config)
      if (!res.ok) throw new Error('Erreur lors de la génération de l\'export')

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const ext  = FORMAT_OPTIONS.find(f => f.value === format)?.ext ?? '.txt'
      a.href = url
      a.download = `export_comptable_${dateFrom}_${dateTo}${ext}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export généré et téléchargé')
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erreur lors de l\'export')
    } finally {
      setExporting(false)
    }
  }

  const previewLines = buildPreviewLines(format)
  const selectedFmt  = FORMAT_OPTIONS.find(f => f.value === format)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href={ROUTES.ACCOUNTING_REPORTS}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={17} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Export comptable</h1>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Sage 100 · CSV · FEC — compatible logiciels tiers</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Left — config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Period */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <h2 style={sectionTitle}>Période d'export</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Date de début <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Date de fin <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inp} />
              </div>
            </div>
            {/* Quick selectors */}
            {currentYear && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {[
                  { label: `Exercice ${currentYear.year}`, from: `${currentYear.year}-01-01`, to: `${currentYear.year}-12-31` },
                  { label: 'T1', from: `${currentYear.year}-01-01`, to: `${currentYear.year}-03-31` },
                  { label: 'T2', from: `${currentYear.year}-04-01`, to: `${currentYear.year}-06-30` },
                  { label: 'T3', from: `${currentYear.year}-07-01`, to: `${currentYear.year}-09-30` },
                  { label: 'T4', from: `${currentYear.year}-10-01`, to: `${currentYear.year}-12-31` },
                ].map(q => (
                  <button key={q.label} onClick={() => { setDateFrom(q.from); setDateTo(q.to) }}
                    style={{ height: 26, padding: '0 10px', borderRadius: 99, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', fontWeight: 500, transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}>
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Journals */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ ...sectionTitle, margin: 0 }}>Journaux à inclure</h2>
              <button onClick={toggleAll} style={{ fontSize: 12.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                {selectedJournals.size === journals.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {journals.map(j => {
                const checked = selectedJournals.has(j.id)
                return (
                  <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary-light)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleJournal(j.id)} style={{ display: 'none' }} />
                    {checked
                      ? <CheckSquare size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      : <Square size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: checked ? 'var(--primary)' : 'var(--text-2)', minWidth: 36 }}>{j.code}</span>
                    <span style={{ fontSize: 13, color: checked ? 'var(--text-1)' : 'var(--text-2)', flex: 1 }}>{j.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{j.entriesCount} éc.</span>
                  </label>
                )
              })}
              {journals.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>Aucun journal créé</p>
              )}
            </div>
          </div>

          {/* Format */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <h2 style={sectionTitle}>Format de fichier</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {FORMAT_OPTIONS.map(f => (
                <label key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 8, border: `1.5px solid ${format === f.value ? 'var(--primary)' : 'var(--border)'}`, background: format === f.value ? 'var(--primary-light)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <input type="radio" name="format" value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} style={{ accentColor: 'var(--primary)', width: 15, height: 15 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: format === f.value ? 700 : 500, color: format === f.value ? 'var(--primary)' : 'var(--text-1)' }}>{f.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-3)' }}>{f.ext}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{f.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div>
              <label style={lbl}>Encodage</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {ENCODING_OPTIONS.map(e => (
                  <label key={e.value} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${encoding === e.value ? 'var(--primary)' : 'var(--border)'}`, background: encoding === e.value ? 'var(--primary-light)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <input type="radio" name="encoding" value={e.value} checked={encoding === e.value} onChange={() => setEncoding(e.value)} style={{ accentColor: 'var(--primary)', width: 14, height: 14 }} />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: encoding === e.value ? 'var(--primary)' : 'var(--text-1)' }}>{e.label}</span>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '1px 0 0' }}>{e.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ ...sectionTitle, margin: 0 }}>Aperçu ({selectedFmt?.label})</h2>
              <button onClick={() => setShowPreview(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                <Eye size={13} /> {showPreview ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showPreview && (
              <div style={{ background: '#0f1923', borderRadius: 8, padding: '14px 16px', overflowX: 'auto' }}>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#7ea8c4', margin: 0, lineHeight: 1.7, whiteSpace: 'pre' }}>
                  {previewLines.map((line, i) => (
                    <div key={i} style={{ color: i === 0 ? '#22d3ee' : '#c4dff0' }}>
                      <span style={{ color: '#3d5166', userSelect: 'none', marginRight: 12 }}>{String(i + 1).padStart(2, '0')}</span>
                      {line}
                    </div>
                  ))}
                  <div style={{ color: '#3d5166', fontStyle: 'italic', marginTop: 6 }}>  … (données réelles lors de l'export)</div>
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right — summary + CTA */}
        <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>Récapitulatif</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Période', value: dateFrom && dateTo ? `${new Date(dateFrom).toLocaleDateString('fr-FR')} → ${new Date(dateTo).toLocaleDateString('fr-FR')}` : '—' },
                { label: 'Journaux',  value: `${selectedJournals.size} / ${journals.length} sélectionné${selectedJournals.size > 1 ? 's' : ''}` },
                { label: 'Format',    value: selectedFmt?.label ?? '—' },
                { label: 'Extension', value: selectedFmt?.ext ?? '—' },
                { label: 'Encodage',  value: encoding.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>{label}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 500, textAlign: 'right', fontFamily: label === 'Extension' ? 'var(--font-mono)' : 'var(--font-body)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Total entries estimate */}
          <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.06)', border: '1px solid rgba(45,125,210,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Seules les écritures validées dans la période sélectionnée seront exportées.
              </p>
            </div>
          </div>

          <button onClick={handleExport}
            disabled={exporting || !dateFrom || !dateTo || selectedJournals.size === 0}
            style={{ height: 44, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'opacity 0.2s', opacity: exporting || !dateFrom || !dateTo || selectedJournals.size === 0 ? 0.6 : 1 }}>
            {exporting
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Génération…</>
              : <><Download size={16} /> Générer et télécharger</>}
          </button>

          <Link href={ROUTES.ACCOUNTING_REPORTS}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', textDecoration: 'none', transition: 'border-color 0.15s' }}>
            ← Retour à la balance
          </Link>
        </div>
      </div>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)',
  textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px',
}
const lbl: React.CSSProperties = {
  display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500,
  color: 'var(--text-2)', fontFamily: 'var(--font-display)',
}
const inp: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-strong)', background: 'var(--surface)',
  fontSize: 13.5, color: 'var(--text-1)', outline: 'none',
}
