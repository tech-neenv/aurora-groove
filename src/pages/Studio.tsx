import { useNavigate } from 'react-router-dom';
import { LoopSerenity } from '../looper/LoopSerenity';

// /studio — the loop station. Open to everyone; saving prompts sign-in.
export default function Studio() {
  const nav = useNavigate();
  return <LoopSerenity onExit={() => nav('/')} />;
}
