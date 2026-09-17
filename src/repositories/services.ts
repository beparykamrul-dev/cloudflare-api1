import { getDb } from "../db/client.js";

export type ServiceRecord = { serviceId:string; serviceName:string; serviceType:string; repository?:string; status?:string; metadata?:Record<string,unknown> };

export async function upsertService(service: ServiceRecord) {
  await getDb().query(`INSERT INTO ftn_services(service_id,service_name,service_type,repository,status,metadata)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(service_id) DO UPDATE SET service_name=EXCLUDED.service_name,service_type=EXCLUDED.service_type,repository=EXCLUDED.repository,status=EXCLUDED.status,metadata=EXCLUDED.metadata,updated_at=now()`,
    [service.serviceId,service.serviceName,service.serviceType,service.repository ?? null,service.status ?? "active",service.metadata ?? {}]);
}

export async function listServices() { return (await getDb().query("SELECT * FROM ftn_services ORDER BY service_id")).rows; }
