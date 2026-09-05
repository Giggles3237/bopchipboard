import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config';
import { TV_SCREENS, DEFAULT_SETTINGS } from './TVScreens';
import './TVSettings.css';

function normalizeSettings(settings) {
  const hasSelectedAdvisors = Object.prototype.hasOwnProperty.call(settings || {}, 'selectedAdvisors');

  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    activeScreens: Array.isArray(settings?.activeScreens) ? settings.activeScreens : DEFAULT_SETTINGS.activeScreens,
    selectedAdvisors: hasSelectedAdvisors && Array.isArray(settings?.selectedAdvisors) ? settings.selectedAdvisors : DEFAULT_SETTINGS.selectedAdvisors,
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem('tv_dashboard_settings');
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function TVSettings() {
  const { auth } = useAuth();
  const [settings, setSettings]   = useState(loadSettings);
  const [advisors, setAdvisors]    = useState([]);
  const [loadingAdvisors, setLoadingAdvisors] = useState(true);
  const [advisorError, setAdvisorError] = useState('');
  const [saved,    setSaved]       = useState(false);

  const { activeScreens, rotationInterval, selectedAdvisors } = settings;

  const fetchAdvisors = useCallback(async () => {
    try {
      setLoadingAdvisors(true);
      const response = await axios.get(`${API_BASE_URL}/users/salespeople`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      setAdvisors(response.data || []);
      setAdvisorError('');
    } catch (error) {
      console.error('Error fetching TV advisor settings:', error);
      setAdvisorError(error.response?.data?.message || 'Unable to load advisors');
    } finally {
      setLoadingAdvisors(false);
    }
  }, [auth.token]);

  useEffect(() => {
    fetchAdvisors();
  }, [fetchAdvisors]);

  const toggleScreen = (id) => {
    setSettings(prev => {
      const has = prev.activeScreens.includes(id);
      return {
        ...prev,
        activeScreens: has
          ? prev.activeScreens.filter(s => s !== id)
          : [...prev.activeScreens, id],
      };
    });
    setSaved(false);
  };

  const setInterval_ = (val) => {
    setSettings(prev => ({ ...prev, rotationInterval: Number(val) }));
    setSaved(false);
  };

  const toggleAdvisor = (name) => {
    setSettings(prev => {
      const allAdvisorNames = advisors.map(advisor => advisor.name);
      const current = Array.isArray(prev.selectedAdvisors) ? prev.selectedAdvisors : allAdvisorNames;
      const selected = current.includes(name)
        ? current.filter(advisor => advisor !== name)
        : [...current, name];

      return { ...prev, selectedAdvisors: selected };
    });
    setSaved(false);
  };

  const selectAllAdvisors = () => {
    setSettings(prev => ({ ...prev, selectedAdvisors: null }));
    setSaved(false);
  };

  const clearAdvisors = () => {
    setSettings(prev => ({ ...prev, selectedAdvisors: [] }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem('tv_dashboard_settings', JSON.stringify(settings));
    setSaved(true);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem('tv_dashboard_settings', JSON.stringify(DEFAULT_SETTINGS));
    setSaved(true);
  };

  const tooFew  = activeScreens.length < 1;
  const tooMany = activeScreens.length > 6;

  return (
    <div className="tvs-page">
      <div className="tvs-header">
        <h1 className="tvs-title">TV Dashboard Settings</h1>
        <p className="tvs-subtitle">
          Choose which screens rotate on the TV display for this device. Settings are saved locally in this browser.
        </p>
      </div>

      <div className="tvs-section">
        <h2 className="tvs-section-title">Screens</h2>
        <p className="tvs-section-hint">Select 1–6 screens to rotate through.</p>
        <div className="tvs-screens-grid">
          {TV_SCREENS.map(screen => {
            const active = activeScreens.includes(screen.id);
            const order  = active ? activeScreens.indexOf(screen.id) + 1 : null;
            return (
              <label key={screen.id} className={`tvs-screen-card ${active ? 'tvs-screen-card--active' : ''}`}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleScreen(screen.id)}
                  className="tvs-checkbox"
                />
                <div className="tvs-screen-info">
                  <span className="tvs-screen-label">{screen.label}</span>
                  {active && <span className="tvs-screen-order">#{order}</span>}
                </div>
              </label>
            );
          })}
        </div>
        {tooFew  && <p className="tvs-warning">Select at least 1 screen.</p>}
        {tooMany && <p className="tvs-warning">6 screens maximum recommended.</p>}
      </div>

      <div className="tvs-section">
        <h2 className="tvs-section-title">Rotation Speed</h2>
        <p className="tvs-section-hint">How many seconds each screen is shown before switching.</p>
        <div className="tvs-interval-row">
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={rotationInterval}
            onChange={e => setInterval_(e.target.value)}
            className="tvs-slider"
          />
          <span className="tvs-interval-value">{rotationInterval}s</span>
        </div>
      </div>

      <div className="tvs-section">
        <div className="tvs-section-heading-row">
          <div>
            <h2 className="tvs-section-title">Advisors</h2>
            <p className="tvs-section-hint">
              Choose which active salespeople appear on the TV display.
            </p>
          </div>
          <div className="tvs-advisor-actions">
            <button type="button" className="tvs-link-btn" onClick={selectAllAdvisors}>
              Show All
            </button>
            <button type="button" className="tvs-link-btn" onClick={clearAdvisors}>
              Clear
            </button>
          </div>
        </div>

        {loadingAdvisors ? (
          <p className="tvs-section-hint">Loading advisors...</p>
        ) : advisorError ? (
          <p className="tvs-warning">{advisorError}</p>
        ) : (
          <>
            <div className="tvs-advisors-grid">
              {advisors.map(advisor => {
                const active = !Array.isArray(selectedAdvisors) || selectedAdvisors.includes(advisor.name);
                return (
                  <label key={advisor.id || advisor.name} className={`tvs-advisor-card ${active ? 'tvs-advisor-card--active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleAdvisor(advisor.name)}
                      className="tvs-checkbox"
                    />
                    <span className="tvs-advisor-name">{advisor.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="tvs-advisor-summary">
              {!Array.isArray(selectedAdvisors) ? 'Showing all active advisors.' : `Showing ${selectedAdvisors.length} selected advisor(s).`}
            </p>
          </>
        )}
      </div>

      <div className="tvs-actions">
        <button
          className="tvs-save-btn"
          onClick={handleSave}
          disabled={tooFew}
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
        <button className="tvs-reset-btn" onClick={handleReset}>
          Reset to Defaults
        </button>
      </div>

      {saved && (
        <p className="tvs-saved-msg">
          Settings saved. Open <a href="/tv">/tv</a> to see your changes.
        </p>
      )}
    </div>
  );
}

export default TVSettings;
