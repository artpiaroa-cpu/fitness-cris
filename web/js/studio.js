/* ══════════════════════════════════════════════════════════════════════════
   studio.js · Contenido del Estudio (casa, pilates, movilidad y cardio)
   ──────────────────────────────────────────────────────────────────────────
   Datos portados literalmente del prototipo. Son contenido editorial fijo, no
   datos de entreno, así que viven en el código y no en la base.
     n = nombre · min = duración · lv = nivel · i = icono · d = descripción
     items[] = bloques del reproductor guiado: s = segundos, c = indicación,
               rest = 1 si es una pausa
   ══════════════════════════════════════════════════════════════════════════ */

export const ROUTINES = {
    pilates:[
      {n:"Core pilates suave",min:12,lv:"Principiante",i:"🌙",d:"Nada de impacto. Perfecto para empezar o para días de descanso activo.",
        items:[
          {n:"Respiración y báscula pélvica",s:60,c:"Tumbada, rodillas dobladas. Al soltar el aire, pega la lumbar al suelo sin apretar los glúteos."},
          {n:"El cien",s:50,c:"Piernas en mesa, cabeza y hombros arriba. Bombea los brazos mientras respiras en series de cinco."},
          {n:"Puente de glúteo",s:45,c:"Sube vértebra a vértebra. Arriba, aprieta el glúteo dos segundos."},
          {n:"Descanso",s:20,c:"Respira profundo y relaja los hombros.",rest:1},
          {n:"Dead bug",s:50,c:"Brazo y pierna contraria bajan a la vez. La lumbar no se despega del suelo."},
          {n:"Bird dog",s:50,c:"A cuatro patas, extiende brazo y pierna contraria sin girar la cadera."},
          {n:"Plancha lateral de rodillas",s:35,c:"Codo bajo el hombro. Sube la cadera y mantén la línea."},
          {n:"Plancha lateral, otro lado",s:35,c:"Mismo lado contrario. Respira, no aguantes el aire."},
          {n:"Almeja",s:40,c:"De lado, rodillas dobladas. Abre la rodilla de arriba sin rotar la cadera."},
          {n:"Estiramiento final",s:45,c:"Rodillas al pecho y balanceo suave. Bien hecho.",rest:1}]},
      {n:"Pilates glúteo y cadera",min:16,lv:"Principiante",i:"🍑",d:"Activación de glúteo medio, lo que más falta hace si pasas el día sentada.",
        items:[
          {n:"Puente de glúteo",s:50,c:"Vértebra a vértebra. Aprieta arriba."},
          {n:"Puente con marcha",s:50,c:"Arriba, levanta un pie unos centímetros sin que caiga la cadera."},
          {n:"Almeja",s:45,c:"Abre la rodilla superior manteniendo los pies juntos."},
          {n:"Almeja, otro lado",s:45,c:"Mismo trabajo del lado contrario."},
          {n:"Descanso",s:20,c:"Sacude las piernas.",rest:1},
          {n:"Patada de glúteo a cuatro patas",s:45,c:"Talón al techo con la rodilla doblada, sin arquear la lumbar."},
          {n:"Patada, otro lado",s:45,c:"Cambia de pierna."},
          {n:"Abducción tumbada",s:45,c:"De lado, sube la pierna estirada sin echarla hacia delante."},
          {n:"Abducción, otro lado",s:45,c:"Cambia de lado."},
          {n:"Puente a una pierna",s:40,c:"Una pierna extendida. Si es mucho, vuelve a dos."},
          {n:"Estiramiento de glúteo",s:50,c:"Tobillo sobre la rodilla contraria y acerca el muslo al pecho.",rest:1}]}
    ],
    casa:[
      {n:"Cuerpo completo sin equipo",min:20,lv:"Principiante",i:"🏠",d:"Solo necesitas una silla y espacio para tumbarte.",
        items:[
          {n:"Movilidad de calentamiento",s:60,c:"Círculos de brazos, sentadillas sin peso y rotaciones de cadera.",rest:1},
          {n:"Sentadilla peso corporal",s:45,c:"Baja como si te sentaras en una silla. Pecho alto."},
          {n:"Flexiones inclinadas",s:40,c:"Manos en el sofá o la encimera. Cuanto más alto, más fácil."},
          {n:"Zancadas alternas",s:50,c:"Paso largo, rodilla trasera casi al suelo."},
          {n:"Descanso",s:25,c:"Respira. Bebe agua.",rest:1},
          {n:"Puente de glúteo",s:45,c:"Aprieta arriba dos segundos."},
          {n:"Fondos en silla",s:40,c:"Manos en el borde, codos atrás, baja hasta 90°."},
          {n:"Plancha",s:35,c:"Cuerpo en línea recta. Si es mucho, apoya rodillas."},
          {n:"Superman",s:35,c:"Boca abajo, sube pecho y piernas a la vez."},
          {n:"Estiramiento",s:60,c:"Isquios, cuádriceps y pecho. Sin rebotes.",rest:1}]},
      {n:"Glúteos y piernas en casa",min:18,lv:"Principiante",i:"🦵",d:"Todo tumbada o de pie, sin material.",
        items:[
          {n:"Calentamiento",s:50,c:"Marcha en el sitio y sentadillas suaves.",rest:1},
          {n:"Sentadilla con pausa",s:45,c:"Aguanta 2 segundos abajo antes de subir."},
          {n:"Sentadilla búlgara",s:45,c:"Pie trasero en la silla. Torso erguido."},
          {n:"Búlgara, otra pierna",s:45,c:"Cambia de pierna."},
          {n:"Descanso",s:25,c:"Sacude las piernas.",rest:1},
          {n:"Puente a una pierna",s:40,c:"Cadera estable, sin girar."},
          {n:"Puente, otra pierna",s:40,c:"Cambia de lado."},
          {n:"Elevación de talones",s:40,c:"Rango completo, sin rebotes."},
          {n:"Estiramiento de piernas",s:55,c:"Isquios y cuádriceps, 20 segundos cada uno.",rest:1}]}
    ],
    movilidad:[
      {n:"Movilidad matinal",min:9,lv:"Todos",i:"🌅",d:"Para desentumecer al levantarte o antes de entrenar.",
        items:[
          {n:"Gato y camello",s:50,c:"A cuatro patas, alterna redondear y arquear la espalda al ritmo de la respiración."},
          {n:"Rotación torácica",s:45,c:"A cuatro patas, mano en la nuca, abre el codo al techo."},
          {n:"Rotación, otro lado",s:45,c:"Cambia de brazo."},
          {n:"Estiramiento de flexores",s:45,c:"En zancada, empuja la cadera adelante apretando el glúteo de atrás."},
          {n:"Flexores, otro lado",s:45,c:"Cambia de pierna."},
          {n:"Posición 90/90",s:50,c:"Sentada, ambas rodillas a 90°. Gira el torso hacia la pierna de delante."},
          {n:"90/90, otro lado",s:50,c:"Cambia el lado."},
          {n:"Perro boca abajo",s:45,c:"Empuja el suelo, talones hacia abajo sin forzar."},
          {n:"Respiración final",s:45,c:"Tumbada, cinco respiraciones profundas.",rest:1}]}
    ]
  };

  export const CARDIO = [
    {n:"Caminar",met:3.5,i:"🚶"},{n:"Correr",met:9.8,i:"🏃"},{n:"Bici",met:7.0,i:"🚴"},
    {n:"Remo",met:7.0,i:"🚣"},{n:"Elíptica",met:5.0,i:"🌀"},{n:"Comba",met:11.0,i:"🪢"}
  ];
