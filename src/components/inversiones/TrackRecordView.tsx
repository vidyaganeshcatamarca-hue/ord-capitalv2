import { useState } from 'react'
import { t } from '@/locales/i18n'
import { TrackRecordList } from './TrackRecordList'
import { RendimientoInflacionChart } from './RendimientoInflacionChart'
import './TrackRecordView.css'

interface TrackRecordViewProps {
  className?: string
}

type TrackRecordTab = 'list' | 'chart'

export function TrackRecordView({ className }: TrackRecordViewProps) {
  const [activeTab, setActiveTab] = useState<TrackRecordTab>('list')
  const rootClass = className
    ? `track-record-view ${className}`
    : 'track-record-view'

  return (
    <section className={rootClass}>
      <header className="track-record-view-header">
        <div>
          <h2 className="track-record-view-title">{t('tab_track_record')}</h2>
          <p className="track-record-view-subtitle">{t('track_record_subtitle')}</p>
        </div>

        <div className="track-record-view-tabs" role="tablist" aria-label={t('tab_track_record')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'list'}
            className={
              activeTab === 'list'
                ? 'track-record-view-tab track-record-view-tab--active'
                : 'track-record-view-tab'
            }
            onClick={() => setActiveTab('list')}
          >
            {t('tab_track_record')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'chart'}
            className={
              activeTab === 'chart'
                ? 'track-record-view-tab track-record-view-tab--active'
                : 'track-record-view-tab'
            }
            onClick={() => setActiveTab('chart')}
          >
            {t('label_real_yield')}
          </button>
        </div>
      </header>

      <div className="track-record-view-panel" role="tabpanel">
        {activeTab === 'list' ? <TrackRecordList /> : <RendimientoInflacionChart />}
      </div>
    </section>
  )
}

export default TrackRecordView
