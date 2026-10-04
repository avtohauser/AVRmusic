// After a restart of the phone (or a change of the clock) the alarm is set again: starting the app's
// process does it (App.start → Alarm.init), this receiver only wakes the process.
package space.avthsr.music.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmBoot : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Alarm.reschedule()
  }
}
