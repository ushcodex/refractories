import { showToast } from './utils.js';

const CERT_DATA = [
  {
    "id": "hayatu-umar-yahaya",
    "name": "HAYATU UMAR YAHAYA",
    "title": "Chairman of the FYB Committee",
    "description": "Presented to Hayatu Umar Yahaya in recognition of your outstanding leadership, vision and unwavering dedication as Chairman of the FYB Committee. You led with wisdom, sacrifice and exemplary commitment, coordinating the affairs of the final year with excellence and ensuring our set had a memorable and successful final year.",
    "qr_link": "u19ce.pages.dev/certificates/hayatu-umar-yahaya",
    "pdf_name": "hayatu-umar-yahaya.pdf",
    "webp": "hayatu-umar-yahaya.webp"
  },
  {
    "id": "hadassah-olumatobi-ayoola",
    "name": "HADASSAH OLUMATOBI AYOOLA",
    "title": "Vice Chairman",
    "description": "Presented to Hadassah Olumatobi Ayoola in recognition of your loyal support, diligence and committed service as Vice Chairman. You stood as a dependable pillar to the committee, demonstrating grace, responsibility and a genuine passion for the success of our final year activities.",
    "qr_link": "u19ce.pages.dev/certificates/hadassah-olumatobi-ayoola",
    "pdf_name": "hadassah-olumatobi-ayoola.pdf",
    "webp": "hadassah-olumatobi-ayoola.webp"
  },
  {
    "id": "hassan-ibrahim-badaru",
    "name": "HASSAN IBRAHIM BADARU",
    "title": "Financial Secretary",
    "description": "Presented to Hassan Ibrahim Badaru in recognition of your exceptional integrity, transparency and dedicated service as Financial Secretary. You managed our collective resources with utmost accountability and trust, proving yourself a custodian of honour and responsibility.",
    "qr_link": "u19ce.pages.dev/certificates/hassan-ibrahim-badaru",
    "pdf_name": "hassan-ibrahim-badaru.pdf",
    "webp": "hassan-ibrahim-badaru.webp"
  },
  {
    "id": "muhammad-sajad-islam",
    "name": "MUHAMMAD SAJAD ISLAM",
    "title": "Logistic Officer",
    "description": "Presented to Muhammad Sajad Islam in recognition of your outstanding diligence and selfless service as Logistic Officer. Your tireless efforts, organizational skills and commitment to seamless execution were vital to the success of all our engagements.",
    "qr_link": "u19ce.pages.dev/certificates/muhammad-sajad-islam",
    "pdf_name": "muhammad-sajad-islam.pdf",
    "webp": "muhammad-sajad-islam.webp"
  },
  {
    "id": "dandana-munir-nagaji",
    "name": "DANDANA MUNIR NAGAJI",
    "title": "Asst. Secretary General",
    "description": "Presented to Dandana Munir Nagaji in recognition of your dedicated and commendable service as Assistant Secretary General. Your attention to detail, administrative support and unwavering commitment greatly enhanced the effectiveness of the committee.",
    "qr_link": "u19ce.pages.dev/certificates/dandana-munir-nagaji",
    "pdf_name": "dandana-munir-nagaji.pdf",
    "webp": "dandana-munir-nagaji.webp"
  },
  {
    "id": "oham-sally-delight",
    "name": "OHAM SALLY DELIGHT",
    "title": "Secretary General",
    "description": "Presented to Oham Sally Delight in recognition of your exceptional administrative prowess, dedication and meritorious service as Secretary General. You served as the engine room of the committee, with excellent record-keeping, communication and devotion to duty.",
    "qr_link": "u19ce.pages.dev/certificates/oham-sally-delight",
    "pdf_name": "oham-sally-delight.pdf",
    "webp": "oham-sally-delight.webp"
  },
  {
    "id": "ahmadu-musa-gwoza",
    "name": "AHMADU MUSA GWOZA",
    "title": "Member",
    "description": "Presented to Ahmadu Musa Gwoza in recognition of your valuable contributions and committed service as a Member of the FYB Committee. Your active participation, ideas and willingness to serve contributed immensely to the achievements of the committee.",
    "qr_link": "u19ce.pages.dev/certificates/ahmadu-musa-gwoza",
    "pdf_name": "ahmadu-musa-gwoza.pdf",
    "webp": "ahmadu-musa-gwoza.webp"
  },
  {
    "id": "muhammed-fatimat-onozasi",
    "name": "MUHAMMED FATIMAT ONOZASI",
    "title": "Chief Planner",
    "description": "Presented to Muhammed Fatimat Onozasi in recognition of your brilliant creativity, foresight and outstanding service as Chief Planner. Your innovative planning, attention to detail and strategic thinking were instrumental in making our final year memorable.",
    "qr_link": "u19ce.pages.dev/certificates/muhammed-fatimat-onozasi",
    "pdf_name": "muhammed-fatimat-onozasi.pdf",
    "webp": "muhammed-fatimat-onozasi.webp"
  },
  {
    "id": "jibrin-suleiman",
    "name": "JIBRIN SULEIMAN",
    "title": "Logistics Officer",
    "description": "Presented to Jibrin Suleiman in recognition of your exceptional hard work, reliability and selfless service as Logistics Officer. You worked tirelessly behind the scenes to ensure every arrangement was in place, demonstrating true spirit of service.",
    "qr_link": "u19ce.pages.dev/certificates/jibrin-suleiman",
    "pdf_name": "jibrin-suleiman.pdf",
    "webp": "jibrin-suleiman.webp"
  },
  {
    "id": "penuel-noel-dautukie",
    "name": "PENUEL NOEL DAUTUKIE",
    "title": "Social",
    "description": "Presented to Penuel Noel Dautukie in recognition of your outstanding vibrancy and dedicated service as Social Officer. You brought life, joy and colour to our activities, fostering unity and unforgettable social memories for the class.",
    "qr_link": "u19ce.pages.dev/certificates/penuel-noel-dautukie",
    "pdf_name": "penuel-noel-dautukie.pdf",
    "webp": "penuel-noel-dautukie.webp"
  },
  {
    "id": "maryam-shuaibu",
    "name": "MARYAM SHUAIBU",
    "title": "Media & Publicity",
    "description": "Presented to Maryam Shuaibu in recognition of your exceptional creativity and dedicated service as Media & Publicity Officer. Through your lens and publicity efforts, you captured our moments and projected the image of our set with excellence and pride.",
    "qr_link": "u19ce.pages.dev/certificates/maryam-shuaibu",
    "pdf_name": "maryam-shuaibu.pdf",
    "webp": "maryam-shuaibu.webp"
  },
  {
    "id": "nuradeen-abdulsamad",
    "name": "NURADEEN ABDULSAMAD",
    "title": "Tutorials",
    "description": "Presented to Nuradeen Abdulsamad in recognition of your meritorious academic support and invaluable contribution through tutorials. Your willingness to share knowledge, explain difficult concepts and uplift your colleagues academically is deeply appreciated and worthy of emulation.",
    "qr_link": "u19ce.pages.dev/certificates/nuradeen-abdulsamad",
    "pdf_name": "nuradeen-abdulsamad.pdf",
    "webp": "nuradeen-abdulsamad.webp"
  },
  {
    "id": "hafsat-yunusa",
    "name": "HAFSAT YUNUSA",
    "title": "Tutor",
    "description": "Presented to Hafsat Yunusa in recognition of your selfless academic service and dedication as a Tutor. You gave your time and knowledge generously to ensure the academic growth of others, embodying true scholarship and sisterhood.",
    "qr_link": "u19ce.pages.dev/certificates/hafsat-yunusa",
    "pdf_name": "hafsat-yunusa.pdf",
    "webp": "hafsat-yunusa.webp"
  },
  {
    "id": "litgwai-elias-filibus",
    "name": "LITGWAI ELIAS FILIBUS",
    "title": "Service",
    "description": "Presented to Litgwai Elias Filibus in recognition of your exceptional and selfless service to the class. Your contributions, though often quiet, have been impactful, consistent and worthy of commendation.",
    "qr_link": "u19ce.pages.dev/certificates/litgwai-elias-filibus",
    "pdf_name": "litgwai-elias-filibus.pdf",
    "webp": "litgwai-elias-filibus.webp"
  },
  {
    "id": "hassan-surajudeen",
    "name": "HASSAN SURAJUDEEN",
    "title": "Tutor",
    "description": "Presented to Hassan Surajudeen in recognition of your outstanding academic support and commitment as a Tutor. Your guidance, intellectual generosity and patience have helped strengthen the academic foundation of many.",
    "qr_link": "u19ce.pages.dev/certificates/hassan-surajudeen",
    "pdf_name": "hassan-surajudeen.pdf",
    "webp": "hassan-surajudeen.webp"
  },
  {
    "id": "nnamani-samuel-chinecherem",
    "name": "NNAMANI SAMUEL CHINECHEREM",
    "title": "Tutor",
    "description": "Presented to Nnamani Samuel Chinecherem in recognition of your dedicated academic service and meritorious contribution as a Tutor. Your patience and commitment to helping others excel academically is truly commendable.",
    "qr_link": "u19ce/pages.dev/certificates/nnamani-samuel-chinecherem",
    "pdf_name": "nnamani-samuel-chinecherem.pdf",
    "webp": "nnamani-samuel-chinecherem.webp"
  },
  {
    "id": "abdul-hakeem-muhammad-fawas",
    "name": "ABDUL HAKEEM MUHAMMAD FAWAS",
    "title": "FYB",
    "description": "Presented to Abdul Hakeem Muhammad Fawas in recognition of your valuable contributions and dedicated service to the Final Year Brethren activities. Your commitment, ideas and support towards the success of our final year are highly appreciated.",
    "qr_link": "u19ce.pages.dev/certificates/abdul-hakeem-muhammad-fawas",
    "pdf_name": "abdul-hakeem-muhammad-fawas.pdf",
    "webp": "abdul-hakeem-muhammad-fawas.webp"
  },
  {
    "id": "abubakar-usama",
    "name": "ABUBAKAR USAMA",
    "title": "Academic",
    "description": "Presented to Abubakar Usama in recognition of your outstanding academic excellence and meritorious intellectual contributions to the class. Your brilliance, diligence and willingness to inspire others academically remain exemplary and highly commendable.",
    "qr_link": "u19ce/pages.dev/certificates/abubakar-usama",
    "pdf_name": "abubakar-usama.pdf",
    "webp": "abubakar-usama.webp"
  },
  {
    "id": "bello-abdulmalik",
    "name": "BELLO ABDULMALIK",
    "title": "Service",
    "description": "Presented to Bello Abdulmalik in recognition of your exceptional dedication and selfless service to the class. Your consistent support, reliability and willingness to serve whenever called upon are truly commendable and deeply valued.",
    "qr_link": "u19ce/pages.dev/certificates/bello-abdulmalik",
    "pdf_name": "bello-abdulmalik.pdf",
    "webp": "bello-abdulmalik.webp"
  },
  {
    "id": "ogbumba-lauretta-chinwendu",
    "name": "OGGUMBA LAURETTA CHINWENDU",
    "title": "Tutorial",
    "description": "Presented to Ogbumba Lauretta Chinwendu in recognition of your outstanding academic support and selfless service through tutorials. Your dedication to the academic upliftment of your peers is exemplary and inspiring.",
    "qr_link": "u19ce/pages.dev/certificates/ogbumba-lauretta-chinwendu",
    "pdf_name": "ogbumba-lauretta-chinwendu.pdf",
    "webp": "ogbumba-lauretta-chinwendu.webp"
  },
  {
    "id": "elaigwu-genevieve-ochanya",
    "name": "ELAIGWU GENEVIEVE OCHANYA",
    "title": "Female Class Rep Jan 2020 to Sept 2022",
    "description": "Presented to Elaigwu Genevieve Ochanya in recognition of your pioneering leadership and meritorious service as Female Class Representative, Jan. 2020 to Sept. 2022. You served with grace, courage and dedication, representing the female folk with dignity and laying a strong foundation for unity and progress.",
    "qr_link": "u19ce/pages.dev/certificates/elaigwu-genevieve-ochanya",
    "pdf_name": "elaigwu-genevieve-ochanya.pdf",
    "webp": "elaigwu-genevieve-ochanya.webp"
  },
  {
    "id": "salawudeen-abdulsamad",
    "name": "SALAWUDEEN ABDULSAMAD",
    "title": "Service",
    "description": "Presented to Salawudeen Abdulsamad in recognition of your dedicated and selfless service to the class. Your consistent contributions, supportive spirit and commitment to the welfare of the class are deeply valued and commendable.",
    "qr_link": "u19ce.pages.dev/certificates/salawudeen-abdulsamad",
    "pdf_name": "salawudeen-abdulsamad.pdf",
    "webp": "salawudeen-abdulsamad.webp"
  },
  {
    "id": "ramatu-sanusi",
    "name": "RAMATU SANUSI",
    "title": "FYB",
    "description": "Presented to Ramatu Sanusi in recognition of your outstanding contributions and dedicated service to the Final Year Brethren Committee. Your creativity, elegance and commitment added great value to our final year celebrations and will be fondly remembered.",
    "qr_link": "u19ce/pages.dev/certificates/ramatu-sanusi",
    "pdf_name": "ramatu-sanusi.pdf",
    "webp": "ramatu-sanusi.webp"
  }
];

function certIdToLink(id) {
  return `/certificates/${id}`;
}

function renderCertificateCard(cert) {
  const grid = document.getElementById('certificates-grid');
  const card = document.createElement('div');
  card.className = 'yb-panel yb-profile-card';
  card.style.cursor = 'pointer';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `View certificate for ${cert.name}`);

  card.innerHTML = `
    <div style="position: relative; aspect-ratio: 4 / 5; background: var(--bg-tertiary); border-radius: 14px; overflow: hidden; border: 1px solid var(--border);">
      <img src="/certificates/img/${cert.webp}" alt="${cert.name}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
      <div style="position: absolute; inset: 0; background: rgba(7,7,12,0.6); opacity: 0; transition: opacity 0.2s ease;">
        <div style="position: absolute; top: 0; left: 0; right: 0; padding: 24px;">
          <h3 style="margin: 0 0 8px; color: var(--accent); font-size: 1.1rem;">${cert.name}</h3>
          <p style="margin: 0; color: var(--text-secondary); font-size: 0.85rem;">${cert.title}</p>
        </div>
        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 12px;">
          <button style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; padding: 8px; font-size: 0.82rem; color: var(--text);">
            View Certificate
          </button>
        </div>
      </div>
    </div>
    <div style="padding: 12px 16px;">
      <h3 style="margin: 0 0 6px; font-size: 0.95rem;">${cert.name}</h3>
      <p style="margin: 0; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">${cert.description}</p>
      <div style="margin-top: 8px;">
        <a href="/certificates/pdf/${cert.pdf_name}" class="yb-tag" style="background: rgba(232,168,56,0.12); color: var(--accent); font-size: 0.75rem; padding: 4px 8px;">Download PDF</a>
        <a href="${cert.qr_link}" class="yb-tag" style="background: rgba(232,168,56,0.12); color: var(--accent); font-size: 0.75rem; padding: 4px 8px; margin-left: 6px;">View QR</a>
      </div>
    </div>
  `;

  card.addEventListener('click', () => {
    window.location.href = certIdToLink(cert.id);
  });

  card.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.location.href = certIdToLink(cert.id);
    }
  });

  grid.appendChild(card);
}

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('certificates-grid');
  
  // Render certificates in reverse order so the first one is at the top
  CERT_DATA.slice().reverse().forEach(renderCertificateCard);

  // Add click handlers for "View Certificate" and "Download PDF" buttons within cards
  document.querySelectorAll('.yb-panel .yb-panel button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.yb-panel');
      if (card) {
        const id = card.dataset.id;
        if (id) window.location.href = `/certificates/${id}`;
      }
    });
  });
});