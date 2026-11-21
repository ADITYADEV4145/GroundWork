export class Settings {
  get current() { return this.workspace.runtime.profile.preferences.appearance.color.primary.active; }
  set current(value) { this.workspace.runtime.profile.preferences.appearance.color.primary.active = value; }
}
