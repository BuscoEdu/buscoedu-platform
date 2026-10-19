select json_build_object(
 'canales_web_whatsapp_md5',(select md5(string_agg(row_to_json(c)::text,'|' order by codigo)) from canales_ia c where codigo in ('web','whatsapp')),
 'topes_web_whatsapp_md5',(select md5(string_agg(row_to_json(t)::text,'|' order by c.codigo)) from topes_gasto_ia t join canales_ia c on c.id=t.canal_id where c.codigo in ('web','whatsapp')),
 'naia_agente_md5',(select md5(string_agg(row_to_json(a)::text,'|' order by id)) from agentes_ia a where id='b45b2ab1-7cca-481c-9b75-59fb840856b4'),
 'proveedores_ia_md5',(select md5(string_agg(row_to_json(p)::text,'|' order by id)) from proveedores_ia p),
 'proveedores_ia_n',(select count(*) from proveedores_ia),
 'despliegues_ia_n',(select count(*) from despliegues_ia),
 'despliegues_ia_md5',(select md5(coalesce(string_agg(row_to_json(d)::text,'|' order by id),'')) from despliegues_ia d),
 'config_agente_canal_md5',(select md5(coalesce(string_agg(row_to_json(x)::text,'|' order by id),'')) from configuraciones_agente_canal x),
 'versiones_agente_n',(select count(*) from versiones_agente_ia),
 'canales_n',(select count(*) from canales_ia),'topes_n',(select count(*) from topes_gasto_ia),'bitacora_topes_n',(select count(*) from bitacora_topes_gasto_ia),
 'qa_e1',(select row_to_json(q) from (select c.id,c.codigo,c.activo,c.agente_predeterminado_id,t.id tope_id,t.tope_diario_usd,t.umbral_alerta_pct from canales_ia c left join topes_gasto_ia t on t.canal_id=c.id where c.codigo='qa_e1') q)
) snap
