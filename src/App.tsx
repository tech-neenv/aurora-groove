import { LoopSerenity } from './looper/LoopSerenity';

// Aurora Groove — the studio is the whole app for now. A marketing landing +
// Google sign-in wrap around it in the next phase.
export default function App() {
  return <LoopSerenity onExit={() => { /* standalone: nowhere to exit to yet */ }} />;
}
