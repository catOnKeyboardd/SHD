// Patient flow: language → scan → voice check-in → result.
// Only imports the pieces; each step lives in its own component.
import LanguagePicker from '../components/kiosk/LanguagePicker.jsx';
import ScanView from '../components/kiosk/ScanView.jsx';
import VoiceCheckIn from '../components/kiosk/VoiceCheckIn.jsx';
import ResultScreen from '../components/kiosk/ResultScreen.jsx';

export default function Kiosk() {
  return (
    <main>
      <h1>Kiosk</h1>
      <LanguagePicker />
      <ScanView />
      <VoiceCheckIn />
      <ResultScreen />
    </main>
  );
}
