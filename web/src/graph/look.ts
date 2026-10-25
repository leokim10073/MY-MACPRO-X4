import { AVATAR_CHOICES, type AvatarLook } from '../components/art/Avatar'

// The same stable id-hash the stage uses for friends, so a character always gets the same face.
export function lookForCharacter(id: string): AvatarLook {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_CHOICES[h % AVATAR_CHOICES.length]
}
