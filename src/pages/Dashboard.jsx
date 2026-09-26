// Nurse view: waiting patients ranked by priority.
import PatientList from '../components/dashboard/PatientList.jsx';

export default function Dashboard() {
  return (
    <main>
      <h1>Nurse dashboard</h1>
      <PatientList />
    </main>
  );
}
