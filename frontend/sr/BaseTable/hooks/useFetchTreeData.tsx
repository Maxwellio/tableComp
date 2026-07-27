import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../services/api';

// Правка 1. rootId стал необязательным параметром вместо захардкоженного значения
// в BaseTreeTable, а типы приведены к string/number (было String/Number — это
// объектные обёртки, а не примитивы).
export const useFetchData = <T,> (url:string, rootId?:number|string) => {
    const api = useApi(); //обязательно использовать <AxiosProvider>
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
 
    useEffect(() => {
        // Правка 1. Зависимости [url, rootId] вместо [] — иначе смена пропсов
        // не перезапрашивает дерево. Флаг cancelled нужен именно из-за этого:
        // при быстрой смене url/rootId ответ старого запроса может прийти
        // последним и затереть более свежие данные.
        let cancelled = false;
        const fetchData = async () => {
            setLoading(true);
            try {
                // Правка 1. Без rootId дерево запрашивается целиком по `${url}`
                // (сценарий «грузим всё сразу»), с rootId — от конкретного корня.
                const reqApi = (rootId === undefined || rootId === null) ? `${url}` : `${url}/${rootId}`;
                const data = (await api.get(reqApi)).data;
                if (cancelled) return;
                // Правка 1. Array.of(data) поддерживал ровно один корень-объект:
                // на массиве корней он давал [[root1, root2]] — одну фиктивную строку,
                // обёрнутую вокруг массива. Нормализуем оба варианта ответа.
                setData(Array.isArray(data) ? data : [data]);
                setError(null);
            } catch(err){
                if (cancelled) return;
                setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchData();
        return () => { cancelled = true; };
    }, [url, rootId]);

    // Ленивая догрузка детей. В режиме «грузим всё сразу» не используется:
    // BaseTreeTable больше её не вызывает (см. правку 2). Оставлена как есть
    // для будущего ленивого режима; известные проблемы разбирались отдельно
    // (флаг hasLoaded проставляется узлам, которых никто не грузил).
    const fetchChildren = useCallback(async (parentId,) => {
        const reqApi = `${url}/${parentId}/children`;
        const children = (await api.get(reqApi)).data;
        setData(prev => {
            const updateNode = (nodes) =>{
                return nodes.map(node => {         
                    if (node.id  === parentId && !node.hasLoaded){
                        return {...node, children: children, hasLoaded: true};
                    }
                    if (node.children) {
                        return {...node, children: updateNode(node.children), hasLoaded: true}
                    }
                    return node;
                })
            }
            return updateNode(prev);
        })        
        
    }, [])

    return {
        data,
        loading,
        setData,
        fetchChildren
    }
};


