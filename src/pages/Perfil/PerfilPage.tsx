import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { t } from '@/locales/i18n';
import { useNavigate } from 'react-router-dom';
import { useModoApp } from '@/contexts/ModoAppContext';

export function PerfilPage() {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { modo, hasFeature } = useModoApp();
  const [hasHiddenFugas, setHasHiddenFugas] = useState(
    () => localStorage.getItem('ocultar_fugas_misterio') === 'true'
  )

  const handleSignOut = async () => {
    try {
      await signOut();
      showToast(t('success_logout'), 'success');
    } catch (error: any) {
      showToast(t('error_logout') + (error.message || error), 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="font-display" style={{ fontSize: 22 }}>Mi Perfil</h2>
      </div>
      <div className="section" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-coral), var(--color-amber))',
              display: 'grid',
              placeItems: 'center',
              fontSize: '20px',
              fontWeight: 'bold',
              color: 'var(--color-bg-dark)'
            }}>
              {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text)' }}>Usuario Activo</h4>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)' }}>{user?.email}</p>
            </div>
          </div>
        </div>

        {hasHiddenFugas && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--color-text)' }}>
              {t('config_fugas_title')}
            </h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                {t('config_fugas_desc')}
              </span>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('ocultar_fugas_misterio');
                  setHasHiddenFugas(false);
                  window.dispatchEvent(new Event('fugas-config-changed'));
                  showToast(t('config_fugas_reset_success'), 'success');
                }}
                style={{
                  background: 'rgba(78, 205, 196, 0.1)',
                  color: 'var(--color-mint)',
                  border: '1px solid rgba(78, 205, 196, 0.3)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}
              >
                {t('config_fugas_reset_btn')}
              </button>
            </div>
          </div>
        )}

        {hasFeature('menu_privacidad_datos') && (
          <button
            onClick={() => navigate('/privacidad')}
            className="btn-primary"
            style={{
              background: 'rgba(78, 205, 196, 0.1)',
              color: 'var(--color-mint)',
              border: '1px solid rgba(78, 205, 196, 0.3)',
              padding: '12px',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '600',
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
            }}
          >
            <span>{t('privacidad_open')}</span>
            <span style={{ fontSize: '12px', fontWeight: '400', color: 'var(--color-text-muted)' }}>
              {t('privacidad_subtitle')}
            </span>
          </button>
        )}

        <button
          onClick={() => navigate('/configuracion')}
          className="btn-primary"
          style={{
            background: 'rgba(78, 205, 196, 0.06)',
            color: 'var(--color-mint)',
            border: '1px solid rgba(78, 205, 196, 0.22)',
            padding: '12px',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '600',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {t('config_open')}
        </button>

        <button
          onClick={handleSignOut}
          className="btn-primary"
          style={{
            background: 'rgba(255, 107, 107, 0.1)',
            color: 'var(--color-coral)',
            border: '1px solid rgba(255, 107, 107, 0.3)',
            padding: '12px',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '600',
            width: '100%',
            transition: 'all 0.2s ease'
          }}
        >
          {t('btn_logout')}
        </button>
      </div>
    </div>
  )
}
