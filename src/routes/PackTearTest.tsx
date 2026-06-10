// Temporary diagnostic route: mounts PackTearScene without auth so the
// tear interaction can be exercised in isolation. Remove after debugging.
import PackTearScene from '../components/PackRip/pack3d/PackTearScene'

const TEST_IMAGE =
  'https://gcwqxxnaccxjmrndowbu.supabase.co/storage/v1/object/public/pack-images/bee2d1cb-7b4d-439c-8dbe-54d7caec22cd.png'

export default function PackTearTest() {
  return (
    <PackTearScene
      packImageUrl={TEST_IMAGE}
      onTornAway={() => console.log('[PackTearTest] torn away')}
    />
  )
}
