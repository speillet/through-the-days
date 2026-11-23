// How the journal is protected (D-004, D-006, D-003, D-009), stated accurately:
// the live journal relies on macOS, backups are encrypted separately, nothing is
// uploaded, copies kept by Time Machine or a sync service are outside the app's
// reach, and deleting is not forensic erasure. SettingsView renders the h2.

import { useStartup } from '../../state/startup';
import { BACKUPS_KEPT } from '../backup/status';
import '../backup/backup.css';
import {useState} from 'react';
import {useApi,toCommandError} from '../../api/client';
import {Button} from '../../components/Button';
import {Notice} from '../../components/Notice';

export function PrivacySection() {
  const api=useApi();const [cleared,setCleared]=useState(false);const [error,setError]=useState<string|null>(null);
  async function clearSummaries(){setCleared(false);setError(null);try{await api.clearReadingSummaries();setCleared(true);}catch(caught){setError(toCommandError(caught).message);}}
  const dataLocation = useStartup().status?.dataLocation ?? null;
  return (
    <div className="settings-stack privacy">
      <div className="privacy__block">
        <h3 className="backup-group__title">Your journal on this Mac</h3>
        <p className="settings-text">
          Your journal is stored in the app’s data folder on this Mac
          {dataLocation ? (
            <>
              : <span className="data-location">{dataLocation}</span>
            </>
          ) : (
            '.'
          )}
        </p>
        <p className="settings-text">
          It is protected by your macOS account and by the Mac’s disk protections. The app does not encrypt this live
          journal itself, and it cannot tell whether FileVault disk encryption is turned on. You can check in System
          Settings, under Privacy &amp; Security.
        </p>
      </div>

      <div className="privacy__block">
        <h3 className="backup-group__title">Encrypted backups</h3>
        <p className="settings-text">
          Backups are separate copies of the journal, encrypted with your backup passphrase. A backup file and its
          passphrase are enough to restore it on any Mac, so keep the passphrase private.
        </p>
      </div>

      <div className="privacy__block">
        <h3 className="backup-group__title">Offline and private</h3>
        <p className="settings-text">
          The app works offline. It has no account, sends no analytics, and never uploads your writing or your backups.
        </p>
      </div>

      <div className="privacy__block">
        <h3 className="backup-group__title">Deleting entries</h3>
        <p className="settings-text">
          Deleted entries stay in the trash for 30 days. After that, they are removed from the journal on this Mac.
        </p>
        <p className="settings-text">
          Backups follow their own rule: the {BACKUPS_KEPT} most recent backups are kept, whatever their dates. A backup
          made before you deleted an entry can still contain it until that backup is removed, or until you delete the
          backup file yourself.
        </p>
        <p className="settings-text">
          Time Machine and other backups of this Mac keep their own copies of your journal, unencrypted unless the backup
          disk is encrypted. Deleting entries or erasing app data doesn’t remove those copies, nor the copies that a
          service such as iCloud Drive keeps when it syncs your backup folder.
        </p>
        <p className="settings-text">
          Deleting is not forensic erasure: traces of deleted writing can remain on the disk until macOS overwrites
          them.
        </p>
      </div>
      <div className="privacy__block"><h3 className="backup-group__title">Generated reading information</h3><p className="settings-text">Clear local weekly summaries whenever you like. Your original writing, weekly notes and private milestones are kept. The search index is temporary and rebuilt from saved entries for each query.</p><Button onClick={()=>void clearSummaries()}>Clear local summaries</Button>{cleared ? <p role="status">Local summaries cleared.</p>:null}{error ? <Notice tone="error">{error}</Notice>:null}</div>
    </div>
  );
}
