import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { gzipSync } from 'zlib';
import { EmailService } from '../email/email.service';

@Injectable()
export class DbBackupService {
  private readonly logger = new Logger(DbBackupService.name);

  constructor(private readonly emailService: EmailService) {}

  // Every Sunday at 2 AM UTC
  @Cron('0 2 * * 0')
  async handleWeeklyBackup(): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `db-backup-${date}.sql.gz`;

    try {
      const dumpBuffer = execSync(`pg_dump "${process.env.DATABASE_URL}"`, {
        maxBuffer: 200 * 1024 * 1024,
      });

      const compressed = gzipSync(dumpBuffer);
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      const { error } = await supabase.storage
        .from('backups')
        .upload(`backups/${filename}`, compressed, {
          contentType: 'application/gzip',
          upsert: false,
        });

      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      await this.pruneOldBackups(supabase);
      this.logger.log(`[DbBackup] Weekly backup complete: ${filename}`);
    } catch (err: any) {
      this.logger.error(`[DbBackup] FAILED: ${err.message}`);

      const alertEmail = process.env.ADMIN_BACKUP_EMAIL;
      if (!alertEmail) {
        this.logger.error('[DbBackup] ADMIN_BACKUP_EMAIL is not configured; backup failure email was not sent.');
        return;
      }

      await this.emailService.sendBrandedEmail({
        to: alertEmail,
        subject: 'ALERT: CarMazium weekly DB backup failed',
        bodyHtml: `<p>The weekly database backup cron failed at ${new Date().toISOString()}.</p>
                   <p><strong>Error:</strong> ${err.message}</p>`,
      });
    }
  }

  async pruneOldBackups(supabase: ReturnType<typeof createClient>): Promise<void> {
    const { data: files } = await supabase.storage
      .from('backups')
      .list('backups', { limit: 100 });

    if (!files) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const toDelete = files
      .filter((f: any) => new Date(f.created_at) < cutoff)
      .map((f: any) => `backups/${f.name}`);

    if (toDelete.length > 0) {
      await supabase.storage.from('backups').remove(toDelete);
      this.logger.log(`[DbBackup] Pruned ${toDelete.length} old backup(s)`);
    }
  }
}
