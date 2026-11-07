import { PageHeader } from '../components/Layout'
import { SignatureLibrary } from '../components/SignatureLibrary'

export default function Signatures() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Signatures" subtitle="Your saved handwritten signatures. They are stored only in this browser." />
      <SignatureLibrary />
    </div>
  )
}
