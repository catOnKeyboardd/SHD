// Nurse view: waiting patients ranked by priority.
import PatientList from '../components/dashboard/PatientList.jsx';
import '../styles/dashboard.css';

export default function Dashboard() {
  return (
    <main className="dashboard">
      <h1>Nurse dashboard</h1>
      <PatientList />
    </main>
  );
}
